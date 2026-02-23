# Trip-centric API — Everything attached to the trip

This document describes the **trip-centric** API design: every action is on the trip, and the trip has an explicit **phase** so the mobile app can drive UI from a single `GET /trips/:id` response.

---

## Why trip-centric?

- **One source of truth:** `GET /api/v1/trips/:id` returns the trip with `phase`. No need to infer state from events or call multiple endpoints.
- **Simple actions:** One action = one endpoint. No mixing `POST /vehicles/:id/queue/start` and `POST /trips/:id/events` with different event types.
- **Events still exist:** Each action updates the trip phase and creates the corresponding trip event(s) and queue updates under the hood (audit trail preserved).

---

## Trip phase (lifecycle state)

Every trip has a `phase` field. Use it to decide what to show and which buttons to enable.

| Phase | Meaning | Typical UI |
|-------|---------|------------|
| `AT_ORIGIN_ARRIVED` | Trip created; vehicle at origin in LOADING queue | Card: "Arrived at &lt;origin&gt;", button **Start processing** |
| `AT_ORIGIN_LOADING` | Loading (service) started at origin | Button **End processing** |
| `AT_ORIGIN_LOADING_ENDED` | Loading ended; must set destination then exit | **Set destination** (picker) + **Vehicle exited** |
| `READY_TO_EXIT` | Destination set; waiting for exit | Button **Vehicle exited** |
| `IN_TRANSIT` | Vehicle left origin; en route | "En route to &lt;destination&gt;", at destination: **Record arrival** |
| `AT_DESTINATION_ARRIVED` | Arrived at destination; in UNLOADING queue | Card: "Arrived at &lt;destination&gt;", button **Start processing** |
| `AT_DESTINATION_UNLOADING` | Unloading (service) started | Button **End processing** |
| `AT_DESTINATION_UNLOADING_ENDED` | Unloading ended (PICKUP only; DELIVERY auto-completes) | Button **Complete trip** |
| `COMPLETED` | Trip finished | Success screen, **Done** |

---

## Endpoints

### Get trip (drive UI from this)

```http
GET /api/v1/trips/:id?include=vehicle,originCenter,destinationCenter,events
```

**Response** includes `phase`, `status`, `vehicleId`, `originCenterId`, `destinationCenterId`, `purpose`, and any included relations. Use `phase` to show the right screen and actions.

### Create trip (unchanged)

```http
POST /api/v1/trips
Body: { "vehicleId": number, "originCenterId": number, "purpose": "DELIVERY" | "PICKUP" }
```

On success the trip is created with `phase: "AT_ORIGIN_ARRIVED"` and the vehicle is added to the LOADING queue at origin.

### Trip actions (all return the updated trip)

Each action validates the current phase, updates phase (and creates events/queue changes), then returns the trip.

| Action | Endpoint | Valid phase(s) | Next phase |
|--------|----------|----------------|------------|
| Start loading | `POST /api/v1/trips/:id/start-loading` | `AT_ORIGIN_ARRIVED` | `AT_ORIGIN_LOADING` |
| End loading | `POST /api/v1/trips/:id/end-loading` | `AT_ORIGIN_LOADING` | `AT_ORIGIN_LOADING_ENDED` |
| Set destination | `POST /api/v1/trips/:id/set-destination` Body: `{ "destinationCenterId": number }` | `AT_ORIGIN_LOADING_ENDED` | `READY_TO_EXIT` |
| Exit origin | `POST /api/v1/trips/:id/exit-origin` | `READY_TO_EXIT` | `IN_TRANSIT` |
| Arrive destination | `POST /api/v1/trips/:id/arrive-destination` | `IN_TRANSIT` | `AT_DESTINATION_ARRIVED` |
| Start unloading | `POST /api/v1/trips/:id/start-unloading` | `AT_DESTINATION_ARRIVED` | `AT_DESTINATION_UNLOADING` |
| End unloading | `POST /api/v1/trips/:id/end-unloading` | `AT_DESTINATION_UNLOADING` | DELIVERY: `COMPLETED`; PICKUP: `AT_DESTINATION_UNLOADING_ENDED` |
| Complete trip | `POST /api/v1/trips/:id/complete` | `AT_DESTINATION_UNLOADING_ENDED` (or after end-unloading for PICKUP) | `COMPLETED` |

**Notes:**

- **Set destination** and **Exit origin** can be two taps, or you can combine “set destination” + “vehicle exited” in one flow; the API supports either.
- **Arrive destination** requires `destinationCenterId` to be set (from set-destination). The API adds the vehicle to the UNLOADING queue at destination automatically.
- **End unloading:** For DELIVERY the trip is completed automatically. For PICKUP you get `AT_DESTINATION_UNLOADING_ENDED` and must call **Complete trip** when ready.

---

## Mobile flow (trip-centric)

1. **Origin:** Scan QR → `GET /vehicles/qr-code/{qr}` → confirm vehicle → `POST /trips` (vehicleId, originCenterId, purpose) → store `tripId`.
2. **Origin card:** `GET /trips/:tripId` → if `phase === 'AT_ORIGIN_ARRIVED'` show **Start processing**.
3. **Start processing:** `POST /trips/:tripId/start-loading` → then `GET /trips/:tripId` → phase `AT_ORIGIN_LOADING` → show **End processing**.
4. **End processing:** `POST /trips/:tripId/end-loading` → phase `AT_ORIGIN_LOADING_ENDED` → show **Set destination** + **Vehicle exited**.
5. **Set destination:** User picks center → `POST /trips/:tripId/set-destination` body `{ destinationCenterId }` → phase `READY_TO_EXIT`.
6. **Vehicle exited:** `POST /trips/:tripId/exit-origin` → phase `IN_TRANSIT`.
7. **Destination:** Scan same vehicle again → `GET /vehicles/qr-code/{qr}` → `GET /trips?vehicleId=…&status=ONGOING` → get `tripId` → show “Record arrival”.
8. **Record arrival:** `POST /trips/:tripId/arrive-destination` → phase `AT_DESTINATION_ARRIVED` → show **Start processing**.
9. **Start / End unloading:** `POST /trips/:tripId/start-unloading` then `POST /trips/:tripId/end-unloading`. For DELIVERY, trip becomes `COMPLETED`. For PICKUP, call `POST /trips/:tripId/complete` when done.

You can refresh state anytime with `GET /trips/:tripId` and branch on `phase`.

---

## Errors

- **400 Bad Request** — Trip is not in the phase required for this action. Response message lists allowed phases.
- **400 Bad Request** — e.g. “Trip has no destination center set” on arrive-destination if set-destination was skipped.
- **404 Not Found** — Trip not found or not in this account.

---

## Backward compatibility

- **`POST /api/v1/trips/:id/events`** and **`POST /api/v1/vehicles/:vehicleId/queue/start`** remain available. Prefer the trip action endpoints so phase stays in sync; if you use events/queue directly, consider updating the trip phase yourself or refetching the trip (phase may be derived in a future version).
- **`GET /api/v1/trips/:id`** now includes `phase` in the response.
