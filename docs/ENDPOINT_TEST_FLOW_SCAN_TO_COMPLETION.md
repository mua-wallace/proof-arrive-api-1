# Full endpoint test flow: Scan → Trip completion

Use this as a **sequential checklist** to test the API from first scan to trip completion. Replace placeholders with your real values and use the same `vehicleId`, `tripId`, and center IDs across steps.

**Base URL:** `http://localhost:5000/api/v1` (or your `{API_BASE}/api/v1`)  
**Headers:** `Authorization: Bearer {access_token}`, `Content-Type: application/json` for POST/PUT.

---

## 0. Get an access token (if needed)

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "your@email.com",
  "password": "your_password"
}
```

Use the `accessToken` from the response in the `Authorization: Bearer ...` header for all steps below.

---

## Phase A: At origin (start trip)

### 1. Validate QR code (scan at origin)

```http
GET /api/v1/vehicles/qr-code/{scannedQrCode}
Authorization: Bearer {token}
```

**Example:** `GET /api/v1/vehicles/qr-code/17589`

- **200:** Response includes `vehicleId` and vehicle details. **Store `vehicleId`** for the next steps.
- **400/404:** Invalid or unknown QR → show error, rescan.

---

### 2. Create trip (vehicle at origin, add to LOADING queue)

```http
POST /api/v1/trips
Authorization: Bearer {token}
Content-Type: application/json

{
  "vehicleId": 17589,
  "originCenterId": 4114,
  "purpose": "DELIVERY"
}
```

- Use `vehicleId` from step 1.
- **201:** Response includes `id` (tripId). **Store `tripId` and `originCenterId`** for Phase A and C.
- Vehicle is **automatically** added to the LOADING queue; no separate queue-add call needed at origin.

---

### 3. Start processing (loading at origin)

```http
POST /api/v1/vehicles/{vehicleId}/queue/start
Authorization: Bearer {token}
Content-Type: application/json

{
  "queueType": "LOADING"
}
```

**Example:** `POST /api/v1/vehicles/17589/queue/start`

- **200:** Queue entry gets `serviceStartedAt`. Show “End processing” in the UI.

---

### 4. End processing (loading finished)

```http
POST /api/v1/trips/{tripId}/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "LOADING_ENDED",
  "centerId": 4114,
  "metadata": {}
}
```

- Use `tripId` from step 2 and **origin** `centerId` (e.g. 4114).

---

### 5. Set destination and ready to exit

```http
POST /api/v1/trips/{tripId}/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "READY_TO_EXIT",
  "centerId": 4114,
  "metadata": {
    "destinationCenterId": 4115
  }
}
```

- **Store `destinationCenterId`** (e.g. 4115) for Phase C. Use **origin** `centerId` in the body.

---

### 6. Vehicle exited origin

```http
POST /api/v1/trips/{tripId}/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "EXITED",
  "centerId": 4114
}
```

- Trip moves to **IN_TRANSIT**. No further origin calls.

---

## Phase B: In transit

No API calls. Vehicle is en route. Use stored `tripId` and `destinationCenterId` for Phase C.

---

## Phase C: At destination (finish trip)

### 7. Validate QR code again (scan at destination)

```http
GET /api/v1/vehicles/qr-code/{scannedQrCode}
Authorization: Bearer {token}
```

**Example:** `GET /api/v1/vehicles/qr-code/17589`

- **200:** Confirm `vehicleId`. Use it for steps 9 and 10.

---

### 8. Get active trip for this vehicle

```http
GET /api/v1/trips?vehicleId={vehicleId}&status=ONGOING
Authorization: Bearer {token}
```

**Example:** `GET /api/v1/trips?vehicleId=17589&status=ONGOING`

- **200:** Take the first trip’s `id` as **`tripId`** for the rest of Phase C (use this even if you already had a tripId from origin).
- Empty list → “No active trip”; do not allow arrival.

---

### 9. Record arrival at destination

```http
POST /api/v1/trips/{tripId}/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "ARRIVED_DESTINATION",
  "centerId": 4115
}
```

- Use **destination** `centerId` (e.g. 4115). Vehicle becomes WAITING_IN_QUEUE at destination.

---

### 10. Add vehicle to unloading queue (if using queue at destination)

```http
POST /api/v1/centers/{centerId}/queue
Authorization: Bearer {token}
Content-Type: application/json

{
  "vehicleId": 17589,
  "tripId": 1,
  "queueType": "UNLOADING"
}
```

**Example:** `POST /api/v1/centers/4115/queue`

- Use **destination** `centerId`. Use `vehicleId` from step 7 and `tripId` from step 8.
- Skip if your flow does not use the queue at destination.

---

### 11. Start processing (unloading at destination)

```http
POST /api/v1/vehicles/{vehicleId}/queue/start
Authorization: Bearer {token}
Content-Type: application/json

{
  "queueType": "UNLOADING"
}
```

**Example:** `POST /api/v1/vehicles/17589/queue/start`

- **200:** Show “End processing” in the UI.

---

### 12. End processing (unloading finished) → trip completes

```http
POST /api/v1/trips/{tripId}/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "UNLOADING_ENDED",
  "centerId": 4115,
  "metadata": {}
}
```

- Use **destination** `centerId`.
- **DELIVERY:** Trip is **auto-completed** after this event. You’re done.
- **PICKUP:** If the trip is not auto-completed, call step 13.

---

### 13. (PICKUP only) Manually complete trip

```http
POST /api/v1/trips/{tripId}/complete
Authorization: Bearer {token}
```

- Only when purpose is PICKUP and the trip did not auto-complete after UNLOADING_ENDED.

---

## Optional: Inspect trip and timeline

```http
GET /api/v1/trips/{tripId}?include=events
Authorization: Bearer {token}
```

Use anytime to verify status and event timeline.

---

## Quick reference: endpoints in order

| #  | Phase | Method | Endpoint | Purpose |
|----|--------|--------|----------|---------|
| 0  | —      | POST   | `/auth/login` | Get token |
| 1  | A      | GET    | `/vehicles/qr-code/{scannedQrCode}` | Validate scan at origin |
| 2  | A      | POST   | `/trips` | Create trip (auto LOADING queue) |
| 3  | A      | POST   | `/vehicles/{vehicleId}/queue/start` | Start loading |
| 4  | A      | POST   | `/trips/{tripId}/events` | LOADING_ENDED |
| 5  | A      | POST   | `/trips/{tripId}/events` | READY_TO_EXIT + destinationCenterId |
| 6  | A      | POST   | `/trips/{tripId}/events` | EXITED |
| 7  | C      | GET    | `/vehicles/qr-code/{scannedQrCode}` | Validate scan at destination |
| 8  | C      | GET    | `/trips?vehicleId=…&status=ONGOING` | Get active tripId |
| 9  | C      | POST   | `/trips/{tripId}/events` | ARRIVED_DESTINATION |
| 10 | C      | POST   | `/centers/{centerId}/queue` | Add to UNLOADING queue (optional) |
| 11 | C      | POST   | `/vehicles/{vehicleId}/queue/start` | Start unloading |
| 12 | C      | POST   | `/trips/{tripId}/events` | UNLOADING_ENDED (DELIVERY completes) |
| 13 | C      | POST   | `/trips/{tripId}/complete` | PICKUP manual complete if needed |

---

## Example cURL sequence (placeholders)

```bash
# 0. Login
curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"your_password"}' | jq .

# Set token (replace with actual accessToken from above)
TOKEN="your_access_token_here"
BASE="http://localhost:5000/api/v1"

# 1. Validate QR at origin
curl -s -X GET "$BASE/vehicles/qr-code/17589" -H "Authorization: Bearer $TOKEN" | jq .

# 2. Create trip
curl -s -X POST "$BASE/trips" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"vehicleId":17589,"originCenterId":4114,"purpose":"DELIVERY"}' | jq .

# Set tripId from response (e.g. 1)
TRIP_ID=1
VEHICLE_ID=17589
ORIGIN=4114
DEST=4115

# 3. Start loading
curl -s -X POST "$BASE/vehicles/$VEHICLE_ID/queue/start" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"queueType":"LOADING"}' | jq .

# 4. End loading
curl -s -X POST "$BASE/trips/$TRIP_ID/events" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"eventType\":\"LOADING_ENDED\",\"centerId\":$ORIGIN,\"metadata\":{}}" | jq .

# 5. Ready to exit + destination
curl -s -X POST "$BASE/trips/$TRIP_ID/events" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"eventType\":\"READY_TO_EXIT\",\"centerId\":$ORIGIN,\"metadata\":{\"destinationCenterId\":$DEST}}" | jq .

# 6. Exited
curl -s -X POST "$BASE/trips/$TRIP_ID/events" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"eventType\":\"EXITED\",\"centerId\":$ORIGIN}" | jq .

# --- Phase C (at destination) ---

# 7. Validate QR at destination
curl -s -X GET "$BASE/vehicles/qr-code/17589" -H "Authorization: Bearer $TOKEN" | jq .

# 8. Get ongoing trip
curl -s -X GET "$BASE/trips?vehicleId=$VEHICLE_ID&status=ONGOING" -H "Authorization: Bearer $TOKEN" | jq .

# 9. Arrived at destination
curl -s -X POST "$BASE/trips/$TRIP_ID/events" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"eventType\":\"ARRIVED_DESTINATION\",\"centerId\":$DEST}" | jq .

# 10. Add to unloading queue
curl -s -X POST "$BASE/centers/$DEST/queue" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"vehicleId\":$VEHICLE_ID,\"tripId\":$TRIP_ID,\"queueType\":\"UNLOADING\"}" | jq .

# 11. Start unloading
curl -s -X POST "$BASE/vehicles/$VEHICLE_ID/queue/start" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"queueType":"UNLOADING"}' | jq .

# 12. End unloading (trip completes for DELIVERY)
curl -s -X POST "$BASE/trips/$TRIP_ID/events" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"eventType\":\"UNLOADING_ENDED\",\"centerId\":$DEST,\"metadata\":{}}" | jq .

# Optional: Trip details with events
curl -s -X GET "$BASE/trips/$TRIP_ID?include=events" -H "Authorization: Bearer $TOKEN" | jq .
```

Replace `17589`, `4114`, `4115`, and credentials with your real vehicle ID, origin/destination center IDs, and login. Then run the steps in order to test the full flow from scan to trip completion.
