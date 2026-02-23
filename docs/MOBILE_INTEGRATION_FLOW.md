# Mobile Integration Flow — Trips & Queues

This document is the **primary guide for mobile app integration**. It describes how the app should work at each step, which APIs to call, and what to store.

**Recommended:** Use the **trip-centric API** so everything is attached to the trip and the trip has an explicit **phase**. See **[TRIP_CENTRIC_API.md](./TRIP_CENTRIC_API.md)** for the full spec. In short: `GET /trips/:id` returns `phase`; use `POST /trips/:id/start-loading`, `POST /trips/:id/end-loading`, `POST /trips/:id/set-destination`, `POST /trips/:id/exit-origin`, `POST /trips/:id/arrive-destination`, `POST /trips/:id/start-unloading`, `POST /trips/:id/end-unloading`, and `POST /trips/:id/complete` for actions. No need to call vehicle queue/start or post raw events — the server updates phase and creates events for you.

---

## Table of Contents

1. [UI states → Which endpoint to call](#ui-states--which-endpoint-to-call)
2. [High-level flow](#high-level-flow)
3. [What the mobile app must store](#what-the-mobile-app-must-store)
4. [Phase A: At origin (start trip)](#phase-a-at-origin-start-trip)
5. [Phase B: Leave origin and transit](#phase-b-leave-origin-and-transit)
6. [Phase C: At destination (finish trip)](#phase-c-at-destination-finish-trip)
7. [Flow summary table](#flow-summary-table)
8. [Where parameters come from](#where-parameters-come-from)
9. [Error handling](#error-handling)
10. [API quick reference](#api-quick-reference)

---

## UI states → Which endpoint to call

Use this to know **which endpoint to call** for each screen or action, from “vehicle in queue” until “trip ended”.

| # | What you want to show / do | Endpoint to call | Notes |
|---|----------------------------|------------------|--------|
| 1 | **After scan: Show card** — vehicle info, arrived at, **Start processing** button | No extra call for position. Use `vehicleId` from QR; `tripId` from create-trip (A2) or `GET /trips?vehicleId=…&status=ONGOING` (C2). | **Do not show queue position.** Card shows vehicle, "Arrived at &lt;center&gt;", and button "Start processing". |
| 2 | **Action: Start processing** (loading at origin) | `POST /api/v1/vehicles/{vehicleId}/queue/start` body: `{ "queueType": "LOADING" }` | API finds this vehicle in the queue (any position) and sets `serviceStartedAt`. On 200 → show **End processing**. |
| 3 | **Action: End processing** (loading finished at origin) | `POST /api/v1/trips/{tripId}/events` body: `{ "eventType": "LOADING_ENDED", "centerId": originCenterId, "metadata": { ... } }` | Use stored `tripId` and **origin** `centerId`. |
| 4 | **Action: Set destination & ready to exit** | `POST /api/v1/trips/{tripId}/events` body: `{ "eventType": "READY_TO_EXIT", "centerId": originCenterId, "metadata": { "destinationCenterId": 4115 } }` | Store `destinationCenterId` for destination steps. |
| 5 | **Action: Vehicle exited** (left origin) | `POST /api/v1/trips/{tripId}/events` body: `{ "eventType": "EXITED", "centerId": originCenterId }` | Vehicle becomes IN_TRANSIT. |
| 6 | *(In transit – no endpoint; show “En route”)* | — | — |
| 7 | **Action: Record arrival at destination** | `POST /api/v1/trips/{tripId}/events` body: `{ "eventType": "ARRIVED_DESTINATION", "centerId": destinationCenterId }` | Use **destination** `centerId`. Get `tripId` from `GET /trips?vehicleId=…&status=ONGOING` if needed. |
| 8 | **Action: Add vehicle to unloading queue** | `POST /api/v1/centers/{centerId}/queue` body: `{ "vehicleId", "tripId", "queueType": "UNLOADING" }` | Use **destination** `centerId`. Only if you use the queue at destination. |
| 9 | **After scan at destination: Show card** — vehicle info, arrived at, **Start processing** button | Same as #1: use `vehicleId` from QR, `tripId` from C2. | **Do not show queue position.** |
| 10 | **Action: Start processing** (unloading at destination) | `POST /api/v1/vehicles/{vehicleId}/queue/start` body: `{ "queueType": "UNLOADING" }` | API finds this vehicle in the queue and sets `serviceStartedAt`. On 200 → show **End processing**. |
| 11 | **Action: End processing** (unloading finished) | `POST /api/v1/trips/{tripId}/events` body: `{ "eventType": "UNLOADING_ENDED", "centerId": destinationCenterId, "metadata": { ... } }` | DELIVERY: trip auto-completes. |
| 12 | **Trip ended** (PICKUP: manual complete) | `POST /api/v1/trips/{tripId}/complete` | Only for PICKUP if not auto-completed. |
| — | **Display: Trip status / timeline** | `GET /api/v1/trips/{tripId}?include=events` | Use anytime to show progress or “trip ended”. |

**Short list (actions only):**

- **After scan:** Show **card** with vehicle info, "Arrived at &lt;center&gt;", and **Start processing** button. **Do not show queue position.**
- **Start processing** → `POST /vehicles/{vehicleId}/queue/start` with `queueType: "LOADING"` (origin) or `"UNLOADING"` (destination). API finds the vehicle in the queue by `vehicleId` and updates `serviceStartedAt`. On success → show **End processing**.
- **End processing (loading)** → `POST /trips/{tripId}/events` with `eventType: "LOADING_ENDED"`.
- **End processing (unloading)** → `POST /trips/{tripId}/events` with `eventType: "UNLOADING_ENDED"`.
- **Trip ended** → After UNLOADING_ENDED (DELIVERY auto-completes); for PICKUP call `POST /trips/{tripId}/complete` if needed.

---

## High-level flow

The journey has **three phases**. QR validation is required at both **origin** and **destination**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE A: AT ORIGIN                                                          │
│  Scan QR → Validate → Create trip → Show card (vehicle, arrived at,          │
│  Start processing) → Start processing (by vehicleId) → End processing →    │
│  Set destination → Vehicle exits                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE B: IN TRANSIT                                                         │
│  No API calls. Vehicle is en route.                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE C: AT DESTINATION                                                     │
│  Scan QR → Validate → Get active trip → Record arrival → Add to UNLOADING   │
│  queue → Show card → Start processing (by vehicleId) → End processing →     │
│  Trip completed                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Rules for mobile:**

- **Always** validate the QR with the API; use the returned `vehicleId`, not the raw scan.
- At origin: one **trip** is created; the vehicle is **automatically** added to the **LOADING** queue (no extra call needed).
- At destination: the vehicle is **automatically** added to the **UNLOADING** queue when you record arrival (no extra call needed for queue).
- Use **centerId** (origin or destination) in URLs and bodies; it can be the center’s `id` or `geozoneId` — the API resolves it.

---

## What the mobile app must store

After each step, persist these for the rest of the flow:

| Stored value      | When you get it        | Use it for |
|-------------------|------------------------|------------|
| `vehicleId`       | QR validation response | Create trip, get active trip |
| `tripId`          | Create trip response   | All trip events, queue/start if needed |
| `originCenterId`  | User selection (or GPS) | Events at origin, start loading queue |
| `destinationCenterId` | User selection (Ready to exit) | Events at destination, start unloading queue |

---

## Phase A: At origin (start trip)

**Context:** Agent is at the first center. Vehicle will load (or pick up) here, then leave.

| Step | Mobile action | API call | What to store / do |
|------|----------------|----------|--------------------|
| **A1** | Open scanner, agent scans vehicle QR | `GET /api/v1/vehicles/qr-code/{scannedQrCode}` | On 200: store `vehicleId`, show vehicle info. On 404/400: show error, allow rescan. |
| **A2** | Agent confirms vehicle, selects origin center and purpose (DELIVERY / PICKUP) | `POST /api/v1/trips` body: `{ vehicleId, originCenterId, purpose }` | On 201: store `tripId`, `originCenterId`. Vehicle is auto-added to **LOADING** queue. |
| **A3** | Agent taps **Start processing** on the vehicle card | `POST /api/v1/vehicles/{vehicleId}/queue/start` body: `{ "queueType": "LOADING" }` | Use `vehicleId` from A1. API finds vehicle in queue and sets `serviceStartedAt`. On success → show **End processing**. Do not show queue position. |
| **A4** | Loading finished (End processing) | `POST /api/v1/trips/{tripId}/events` body: `{ "eventType": "LOADING_ENDED", "centerId": originCenterId, "metadata": { ... } }` | — |
| **A5** | Agent sets destination center | `POST /api/v1/trips/{tripId}/events` body: `{ "eventType": "READY_TO_EXIT", "centerId": originCenterId, "metadata": { "destinationCenterId": 4115 } }` | Store `destinationCenterId` for Phase C. |
| **A6** | Vehicle leaves origin | `POST /api/v1/trips/{tripId}/events` body: `{ "eventType": "EXITED", "centerId": originCenterId }` | — |

**Notes:**

- **After A2:** Show a **card** with vehicle info, "Arrived at &lt;origin center&gt;", and a **Start processing** button. Do **not** show queue position.
- **A3:** When the agent taps **Start processing**, call `POST /vehicles/{vehicleId}/queue/start`. The API finds this vehicle in the queue (any position) and sets `serviceStartedAt`. On success, show **End processing** (A4).
- `centerId` in A4–A6 is always the **origin** center.
- IDs: `vehicleId` and `originCenterId` can be from QR response and center list; API accepts `id` or `geozoneId` for centers.

---

## Phase B: Leave origin and transit

No API calls. Vehicle is **IN_TRANSIT**. The app can show “En route to destination” and use stored `tripId` and `destinationCenterId` for the next phase.

---

## Phase C: At destination (finish trip)

**Context:** Agent is at the destination center. Vehicle will unload here and the trip will complete.

| Step | Mobile action | API call | What to store / do |
|------|----------------|----------|--------------------|
| **C1** | Agent scans vehicle QR again | `GET /api/v1/vehicles/qr-code/{scannedQrCode}` | On 200: store `vehicleId` from response. |
| **C2** | App fetches active trip for this vehicle | `GET /api/v1/trips?vehicleId={vehicleId}&status=ONGOING` | On 200: take first trip’s `id` as `tripId`. If empty, show “No active trip”, do not allow arrival. |
| **C3** | Agent confirms vehicle and records arrival | `POST /api/v1/trips/{tripId}/events` body: `{ "eventType": "ARRIVED_DESTINATION", "centerId": destinationCenterId }` | Use `centerId` = destination. Vehicle status becomes WAITING_IN_QUEUE. |
| **C4** | Add vehicle to unloading queue (if using queue) | `POST /api/v1/centers/{centerId}/queue` body: `{ "vehicleId", "tripId", "queueType": "UNLOADING" }` | Use **destination** center as `centerId`. Use `vehicleId` from C1, `tripId` from C2. Skip if not using queue. |
| **C5** | Agent taps **Start processing** on the vehicle card (at destination) | `POST /api/v1/vehicles/{vehicleId}/queue/start` body: `{ "queueType": "UNLOADING" }` | Use `vehicleId` from C1. API finds vehicle in queue and sets `serviceStartedAt`. On success → show **End processing**. Do not show queue position. |
| **C6** | Unloading finished (End processing) | `POST /api/v1/trips/{tripId}/events` body: `{ "eventType": "UNLOADING_ENDED", "centerId": destinationCenterId, "metadata": { ... } }` | DELIVERY: trip auto-completes. PICKUP: may need `POST /api/v1/trips/{tripId}/complete`. |

**Notes:**

- **After C3/C4:** Show a **card** with vehicle info, "Arrived at &lt;destination center&gt;", and a **Start processing** button. Do **not** show queue position.
- **C5:** When the agent taps **Start processing**, call `POST /vehicles/{vehicleId}/queue/start` with `queueType: "UNLOADING"`. On success, show **End processing** (C6).
- `centerId` in C3, C4, C5, C6 is the **destination** center.
- Get `tripId` from C2; do not use a trip id from origin only (vehicle might have multiple trips in rare cases).
- At origin, queue add is **automatic** after create trip; at destination, the app must call **C4** to add to UNLOADING queue if using the queue.

---

## Flow summary table

| Phase | Step | Endpoint | Body / params |
|-------|------|----------|----------------|
| A | A1 | `GET /vehicles/qr-code/{scannedQrCode}` | — |
| A | A2 | `POST /trips` | `vehicleId`, `originCenterId`, `purpose` |
| A | A3 | `POST /vehicles/{vehicleId}/queue/start` | `queueType: "LOADING"` |
| A | A4 | `POST /trips/{tripId}/events` | `eventType: "LOADING_ENDED"`, `centerId`, `metadata?` |
| A | A5 | `POST /trips/{tripId}/events` | `eventType: "READY_TO_EXIT"`, `centerId`, `metadata.destinationCenterId` |
| A | A6 | `POST /trips/{tripId}/events` | `eventType: "EXITED"`, `centerId` |
| B | — | (no calls) | — |
| C | C1 | `GET /vehicles/qr-code/{scannedQrCode}` | — |
| C | C2 | `GET /trips?vehicleId=…&status=ONGOING` | — |
| C | C3 | `POST /trips/{tripId}/events` | `eventType: "ARRIVED_DESTINATION"`, `centerId` |
| C | C4 | `POST /centers/{centerId}/queue` | `vehicleId`, `tripId`, `queueType: "UNLOADING"` |
| C | C5 | `POST /vehicles/{vehicleId}/queue/start` | `queueType: "UNLOADING"` |
| C | C6 | `POST /trips/{tripId}/events` | `eventType: "UNLOADING_ENDED"`, `centerId`, `metadata?` |

---

## Where parameters come from

| Parameter | Source |
|-----------|--------|
| `scannedQrCode` | Camera / QR scanner (string). |
| `vehicleId` | QR validation response (A1 or C1): `vehicleId` or `vehicle.id`. |
| `tripId` | Create trip response (A2) `id`; or active trip from C2. |
| `originCenterId` | User-selected origin center (or GPS). Can be center `id` or `geozoneId`. |
| `destinationCenterId` | User-selected at “Ready to exit” (A5). Can be center `id` or `geozoneId`. |
| `centerId` (in events) | Origin center in A4–A6; destination center in C3, C5. |
| `vehicleId` (queue/start) | From QR (A1 or C1). Used in `POST /vehicles/{vehicleId}/queue/start` for Start processing. |
| `purpose` | User choice: `"DELIVERY"` or `"PICKUP"`. |

---

## Error handling

| Situation | HTTP | What to do |
|-----------|------|------------|
| Invalid or unknown QR | 400 / 404 | Show message, allow rescan. Do not use scanned string as `vehicleId`. |
| Unauthorized | 401 | Refresh token and retry. |
| Vehicle already has active trip | 400 | Show message; do not create another trip. |
| Vehicle already in queue | 400 | Inform user; optional: show queue or skip manual add. |
| Vehicle not in queue (start processing) | 404 | When calling `POST /vehicles/{vehicleId}/queue/start`: vehicle not found or not in queue. Ensure trip was created (origin) or arrival recorded and queue added (destination). |
| Trip not found | 404 | Check `tripId` and that trip is ONGOING (e.g. from C2). |
| Center not found | 404 | Check center id / geozoneId and account. |

---

## API quick reference

**Base URL:** `{API_BASE}/api/v1`  
**Headers:** `Authorization: Bearer {token}`, `Content-Type: application/json` for POST.

- **QR:** `GET /vehicles/qr-code/{scannedQrCode}`
- **Create trip:** `POST /trips` — body: `vehicleId`, `originCenterId`, `purpose`
- **Trip events:** `POST /trips/{tripId}/events` — body: `eventType`, `centerId`, `metadata?`
- **Active trips:** `GET /trips?vehicleId=…&status=ONGOING`
- **Start processing (by vehicle):** `POST /vehicles/{vehicleId}/queue/start` — body: `queueType: "LOADING"` (origin) or `"UNLOADING"` (destination). API finds vehicle in queue by `vehicleId` and updates `serviceStartedAt`. No queue position needed.
- **Complete trip (e.g. PICKUP):** `POST /trips/{tripId}/complete`

Optional: **Get queue:** `GET /centers/{centerId}/queue?type=LOADING|UNLOADING`  
Optional: **Get vehicles in queue:** `GET /centers/{centerId}/queue/vehicles?type=LOADING|UNLOADING`

---

For full request/response examples and more detail, see **TRIPS_API_INTEGRATION_FLOW.md**.
