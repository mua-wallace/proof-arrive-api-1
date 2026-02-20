# Mobile UI flow — Screen-by-screen with suggestions

This document maps the **trip flow** to concrete **mobile screens and UI suggestions**: what to show, what to tap, and how to transition. Use it with [MOBILE_INTEGRATION_FLOW.md](./MOBILE_INTEGRATION_FLOW.md) (APIs) and [ENDPOINT_TEST_FLOW_SCAN_TO_COMPLETION.md](./ENDPOINT_TEST_FLOW_SCAN_TO_COMPLETION.md) (testing).

---

## Table of contents

1. [Flow overview](#flow-overview)
2. [App shell & navigation](#app-shell--navigation)
3. [Phase A: At origin — screens](#phase-a-at-origin--screens)
4. [Phase B: In transit](#phase-b-in-transit)
5. [Phase C: At destination — screens](#phase-c-at-destination--screens)
6. [Trip complete & summary](#trip-complete--summary)
7. [Error & edge-case UI](#error--edge-case-ui)
8. [UI component checklist](#ui-component-checklist)

---

## Flow overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Scanner   │ ──► │ Vehicle     │ ──► │ Create Trip │ ──► │ Vehicle     │
│   (camera)  │     │ Confirm     │     │ (origin +    │     │ Card        │
│             │     │             │     │  purpose)   │     │ + Actions   │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                   │
     Phase C (destination)                                          │
     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
     │   Scanner   │ ──► │ Vehicle +    │ ──► │ Vehicle     │       │
     │   (again)   │     │ Active Trip │     │ Card        │       │
     └─────────────┘     └─────────────┘     │ + Actions   │ ◄─────┘
                                            └──────┬──────┘
                                                   │
                                            ┌──────▼──────┐
                                            │ Trip        │
                                            │ Complete    │
                                            └─────────────┘
```

---

## App shell & navigation

**Suggestions**

- **Bottom tab or drawer:** Home / Scan / My trips (or similar). Keep **Scan** easy to reach (primary action).
- **Header:** App name; optional center selector or “At: &lt;center name&gt;” when relevant.
- **FAB or prominent CTA:** “Scan vehicle” from Home to reduce steps to scanner.
- **Offline:** Show a small banner “No connection” and disable scan/actions that need API; queue actions and retry when back online (optional).

---

## Phase A: At origin — screens

### Screen A0: Scanner (origin)

**Purpose:** Capture vehicle QR before any trip action.

**UI suggestion**

- Full-screen camera view with a clear **scan frame** (e.g. rounded rectangle).
- Overlay text: **“Scan vehicle QR at origin”** or **“Point at vehicle QR code”**.
- Optional: torch toggle for low light.
- **No “Enter code manually”** unless you have a fallback API; prefer rescan to avoid wrong vehicle.

**On successful scan**

- Call `GET /vehicles/qr-code/{scannedQrCode}`.
- On **200** → Navigate to **Vehicle confirm (origin)** with `vehicleId` and vehicle payload.
- On **400/404** → Stay on scanner; show error (see [Error UI](#error--edge-case-ui)).

**Transition:** Scan success → **Screen A1**.

---

### Screen A1: Vehicle confirm (origin)

**Purpose:** Agent confirms it’s the right vehicle and sees key info before creating the trip.

**UI suggestion**

- **Card or sheet** with:
  - **Plate:** large, bold (e.g. “ABC-123”).
  - **Model / brand** (e.g. “Mercedes – Camion”).
  - **Status** (e.g. “Available”) — optional.
- **Primary button:** **“This is the vehicle — Continue”** (or “Start trip at this center”).
- **Secondary:** **“Rescan”** (back to Scanner A0).

**Logic**

- No API call on this screen; you already have `vehicleId` from scan.
- On **Continue** → Navigate to **Screen A2 (Create trip)** and pass `vehicleId`.

**Transition:** Continue → **Screen A2**.

---

### Screen A2: Create trip (origin + purpose)

**Purpose:** Set origin center and trip purpose, then create the trip.

**UI suggestion**

- **Title:** “Start trip” or “Vehicle at origin”.
- **Pre-filled (read-only):** Vehicle plate (and optional model) from A1.
- **Origin center:** Dropdown or searchable list of centers (from `GET /centers` or cached). Pre-select “Current center” if you have location.
- **Purpose:** Segmented control or chips: **DELIVERY** | **PICKUP** (required).
- **Primary button:** **“Create trip”** or **“Confirm — vehicle at origin”**.

**Logic**

- On submit: `POST /trips` with `vehicleId`, `originCenterId`, `purpose`.
- **201:** Store `tripId`, `originCenterId`; navigate to **Screen A3 (Vehicle card — loading)**.
- **400** (e.g. vehicle already has active trip): Show inline error; suggest “View active trip” or “Rescan another vehicle”.

**Transition:** Create success → **Screen A3**.

---

### Screen A3: Vehicle card — loading (at origin)

**Purpose:** Show that the vehicle has arrived at origin and allow “Start processing” → “End processing” and then “Set destination” → “Vehicle exited”.

**UI suggestion**

- **Card layout:**
  - Same vehicle summary (plate, model).
  - **Line of text:** “Arrived at **&lt;origin center name&gt;**”.
  - **Do not show queue position** (per product rule).
- **State 1 — Waiting to start:**
  - One primary button: **“Start processing”** (loading).
- **State 2 — Processing:**
  - Replace with **“End processing”** (loading).
  - Optional: subtle progress or “Loading in progress…”.
- **State 3 — Loading ended:**
  - **“Set destination”** (opens destination picker or next step).
  - Then **“Vehicle exited”** (or “Left origin”).

**Actions and API**

| Button / step           | API call                                                                 | On success UI change                    |
|-------------------------|--------------------------------------------------------------------------|-----------------------------------------|
| Start processing        | `POST /vehicles/{vehicleId}/queue/start` body `{ "queueType": "LOADING" }` | Show **End processing**                 |
| End processing          | `POST /trips/{tripId}/events` `LOADING_ENDED`, `centerId` = origin        | Show **Set destination** + **Exited**   |
| Set destination         | `POST /trips/{tripId}/events` `READY_TO_EXIT` + `metadata.destinationCenterId` | Store destination; show **Vehicle exited** |
| Vehicle exited          | `POST /trips/{tripId}/events` `EXITED`, `centerId` = origin               | Leave card; go to Phase B or Home       |

**Destination picker (for “Set destination”)**

- Reuse same center list as A2; label as “Destination center”.
- Store `destinationCenterId` for Phase C.

**Transition:** After **Vehicle exited** → **Phase B** (e.g. “En route” screen or Home with trip status).

---

## Phase B: In transit

**Purpose:** No API calls; show that the trip is ongoing.

**UI suggestion**

- **Option 1 — Dedicated “En route” screen:**  
  “Trip in progress — En route to **&lt;destination center name&gt;**” and trip ID or vehicle plate. Button: **“Scan at destination when arrived”** (opens Scanner C0).
- **Option 2 — Home with trip banner:**  
  Small banner: “Vehicle **&lt;plate&gt;** en route to **&lt;destination&gt;**”. Tapping opens trip detail or scanner.
- **Option 3 — Trip list:**  
  One card “Ongoing — &lt;origin&gt; → &lt;destination&gt;”. Tap to open trip detail; from there, “Scan at destination”.

No API; use stored `tripId` and `destinationCenterId` for Phase C.

---

## Phase C: At destination — screens

### Screen C0: Scanner (destination)

**Purpose:** Scan the same vehicle again at destination.

**UI suggestion**

- Same as A0 but copy: **“Scan vehicle QR at destination”**.
- On success: same `GET /vehicles/qr-code/{scannedQrCode}`.
- **200** → Navigate to **Screen C1** with `vehicleId`.

**Transition:** Scan success → **Screen C1**.

---

### Screen C1: Vehicle + active trip (destination)

**Purpose:** Ensure there is an ongoing trip for this vehicle before allowing “Record arrival”.

**UI suggestion**

- **Auto-call:** `GET /trips?vehicleId={vehicleId}&status=ONGOING`.
- **If at least one trip:**
  - Show vehicle card (plate, model) + short line: “Active trip to **&lt;destination center&gt;**”.
  - **Primary button:** **“Record arrival at destination”**.
- **If no ongoing trip:**
  - Message: “No active trip for this vehicle.” **“Rescan”** or **“Back”**; do not show “Record arrival”.

**Logic**

- On **Record arrival:** `POST /trips/{tripId}/events` with `ARRIVED_DESTINATION` and `centerId` = destination. Use `tripId` from the ONGOING response (first item).
- **200** → Navigate to **Screen C2 (Vehicle card — unloading)**.
- If you use queue at destination: after arrival you can call `POST /centers/{centerId}/queue` with `UNLOADING` (or rely on your backend adding to queue); then show the same card.

**Transition:** Record arrival success → **Screen C2**.

---

### Screen C2: Vehicle card — unloading (at destination)

**Purpose:** Start unloading → End unloading → Trip completes.

**UI suggestion**

- **Card:** Same as A3: vehicle (plate, model), **“Arrived at &lt;destination center name&gt;**”. Do not show queue position.
- **State 1:** **“Start processing”** (unloading).
- **State 2:** **“End processing”** (unloading).
- **State 3:** For **DELIVERY**, trip auto-completes after “End processing”. For **PICKUP**, show **“Complete trip”** if backend didn’t auto-complete.

**Actions and API**

| Button / step    | API call                                                                  | On success UI change          |
|------------------|---------------------------------------------------------------------------|-------------------------------|
| Start processing | `POST /vehicles/{vehicleId}/queue/start` body `{ "queueType": "UNLOADING" }` | Show **End processing**       |
| End processing   | `POST /trips/{tripId}/events` `UNLOADING_ENDED`, `centerId` = destination | DELIVERY: go to Trip complete |
| Complete trip    | `POST /trips/{tripId}/complete` (PICKUP only if needed)                   | Go to Trip complete           |

**Transition:** After completion → **Screen C3 (Trip complete)**.

---

## Trip complete & summary

### Screen C3: Trip complete

**Purpose:** Confirm success and optionally show summary.

**UI suggestion**

- **Icon:** Checkmark or success illustration.
- **Title:** “Trip completed”.
- **Short text:** “Vehicle **&lt;plate&gt;** — &lt;origin&gt; → &lt;destination&gt;.”
- **Primary button:** **“Done”** (e.g. back to Home or Scan).
- **Secondary (optional):** **“View trip”** → `GET /trips/{tripId}?include=events` and show timeline.

---

## Error & edge-case UI

| Situation                     | UI suggestion |
|------------------------------|----------------|
| Invalid / unknown QR (400/404)| Toast or inline under scanner: “Vehicle not found for this QR. Please rescan.” + **Rescan** button. |
| Unauthorized (401)           | Silent refresh token; on failure redirect to Login. |
| Vehicle already has active trip (400 on create) | Inline on Create trip: “This vehicle already has an active trip.” + **“View trip”** or “Rescan”. |
| No active trip at destination| On C1: “No active trip for this vehicle.” **Rescan** / **Back**. Do not show “Record arrival”. |
| Start processing fails (404) | “Vehicle not in queue. Please ensure trip was created (origin) or arrival recorded (destination).” **Retry** / **Back**. |
| Network error                | “Connection error. Please check your network and try again.” **Retry** for last action. |
| Loading states               | Disable buttons and show spinner or skeleton on the card while API is in progress. |

---

## UI component checklist

Use this as a short checklist for implementation:

- [ ] **Scanner screen** — full-screen camera, scan frame, copy “at origin” / “at destination”.
- [ ] **Vehicle confirm** — plate, model, “Continue” + “Rescan”.
- [ ] **Create trip** — vehicle (read-only), origin dropdown, DELIVERY/PICKUP, “Create trip”.
- [ ] **Vehicle card (origin)** — “Arrived at &lt;center&gt;”, Start/End processing (loading), Set destination, Vehicle exited. No queue position.
- [ ] **Vehicle card (destination)** — “Arrived at &lt;center&gt;”, Start/End processing (unloading). No queue position.
- [ ] **En route** — “En route to &lt;destination&gt;” and way to open scanner at destination.
- [ ] **Active trip check (destination)** — “Record arrival” only if `GET /trips?vehicleId=…&status=ONGOING` returns a trip.
- [ ] **Trip complete** — success message + “Done” (and optional “View trip”).
- [ ] **Errors** — QR invalid, no active trip, not in queue, network; each with clear message and Rescan/Retry/Back.
- [ ] **Loading** — Disable actions and show spinner during API calls.

---

## Screen sequence summary

| Order | Screen                    | Main action / note                          |
|-------|---------------------------|---------------------------------------------|
| A0    | Scanner (origin)          | Scan QR → validate → vehicle confirm        |
| A1    | Vehicle confirm           | Confirm vehicle → create trip form          |
| A2    | Create trip               | Origin + purpose → create trip → vehicle card|
| A3    | Vehicle card (origin)     | Start/End loading → Set destination → Exited|
| B     | En route                  | No API; show “En route to &lt;destination&gt;”   |
| C0    | Scanner (destination)     | Scan QR again → vehicle + active trip       |
| C1    | Vehicle + active trip    | Record arrival → vehicle card (destination) |
| C2    | Vehicle card (destination)| Start/End unloading → trip complete         |
| C3    | Trip complete             | Success + Done / View trip                  |

For API details and test sequence, use [MOBILE_INTEGRATION_FLOW.md](./MOBILE_INTEGRATION_FLOW.md) and [ENDPOINT_TEST_FLOW_SCAN_TO_COMPLETION.md](./ENDPOINT_TEST_FLOW_SCAN_TO_COMPLETION.md).
