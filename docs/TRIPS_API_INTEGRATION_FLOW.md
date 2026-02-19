# Trips & Queues API Integration Flow

This document describes the complete integration flow for the trips and queues system, showing how API endpoints work together to track vehicle movements and manage operations at centers.

## Table of Contents
1. [Overview](#overview)
2. [Mobile App Integration Flow](#mobile-app-integration-flow)
3. [Complete Workflow Example](#complete-workflow-example)
4. [API Endpoints Reference](#api-endpoints-reference)
5. [Event Sequence Diagrams](#event-sequence-diagrams)
6. [Error Handling](#error-handling)

---

## Overview

The system tracks vehicle movements through **Trips** (journeys between centers) and **Trip Events** (immutable timeline of actions). Queue management ensures fair processing order at centers.

### Key Concepts:
- **Trip**: One journey from origin center to destination center
- **Trip Event**: Immutable record of an action (ARRIVED, QUEUED, SERVICE_STARTED, etc.)
- **Queue**: FIFO queue for loading/unloading operations at centers
  - **Daily Reset**: Queue positions reset each day (start from 1 each day)
  - **Queue Type**: LOADING or UNLOADING (clearly visible in responses)
  - **Position**: Sequential position in queue (1, 2, 3...) - automatically calculated
- **Vehicle Status**: Automatically derived from latest trip event

---

## Mobile App Integration Flow

### Overview

The mobile app workflow **always starts with QR code scanning**. The agent scans the vehicle's QR code to identify the vehicle before any trip operations can begin.

### Mobile App Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│              Mobile App: Scan QR Code                   │
│  Agent opens camera and scans vehicle QR code           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  GET /api/v1/vehicles/qr-code/{scannedQrCode}          │
│  Returns: vehicleId, vehicle details                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Mobile App: Display Vehicle Information               │
│  - Plate number                                         │
│  - Model/Brand                                          │
│  - Current status                                       │
│  - Current location                                     │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Agent Confirms: "Yes, this is the correct vehicle"    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Mobile App: Navigate to "Create Trip" Screen          │
│  Pre-filled: vehicleId from QR scan                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  Agent Selects: Origin Center (or uses GPS)            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  POST /api/v1/trips                                     │
│  Body: { vehicleId, originCenterId, purpose }          │
│  vehicleId comes from QR scan response                 │
└─────────────────────────────────────────────────────────┘
```

### Key Points for Mobile App Developers

1. **QR Code Scanning is Mandatory First Step**
   - Always scan QR code before creating trip
   - QR code contains vehicleId as string
   - Validate QR code before proceeding

2. **Vehicle Information Display**
   - Show vehicle details to agent for confirmation
   - Display current vehicle status
   - Show if vehicle already has active trip (warning)

3. **Error Handling**
   - Handle invalid QR codes gracefully
   - Show clear error messages
   - Allow agent to rescan if needed

4. **Pre-fill Forms**
   - Use `vehicleId` from QR scan response
   - Pre-select origin center if agent is at a center
   - Use GPS to suggest nearest center

---

## Complete Workflow Example

### Scenario: Vehicle delivers timber from Forest A to Processing Center B

#### Step 0: Scan and Validate QR Code (Mobile App)

**Agent scans QR code with mobile app. The scanned QR code string MUST be validated via API before proceeding.**

**Step 0a: Scan QR Code**
- Mobile app camera captures QR code string (e.g., "17589")
- QR code string is stored temporarily: `scannedQrCode = "17589"`

**Step 0b: Validate QR Code (REQUIRED)**

```http
GET /api/v1/vehicles/qr-code/{scannedQrCode}
Authorization: Bearer {token}
```

**Example Request:**
```http
GET /api/v1/vehicles/qr-code/17589
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200 OK):**
```json
{
  "vehicle": {
    "id": 17589,
    "thirdPartyId": 17589,
    "plate": "ABC-123",
    "model": "Camion",
    "brand": "Mercedes",
    "status": "AVAILABLE",
    "currentCenterId": null,
    "accountId": 267
  },
  "vehicleId": 17589,
  "qrCode": "17589"
}
```

**Error Responses:**

**404 Not Found** - Vehicle not found for QR code:
```json
{
  "statusCode": 404,
  "message": "Vehicle not found for QR code. The QR code may be invalid or belong to a different account.",
  "error": "Not Found"
}
```

**400 Bad Request** - Invalid QR code format:
```json
{
  "statusCode": 400,
  "message": "Invalid QR code: vehicle ID is not valid",
  "error": "Bad Request"
}
```

**401 Unauthorized** - Token expired:
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**What the mobile app MUST do:**
1. ✅ Call validation endpoint immediately after scan
2. ✅ Handle validation errors gracefully
3. ✅ Extract `vehicleId` from successful validation response
4. ✅ Display vehicle information to agent for confirmation
5. ✅ Show error message and allow rescan if validation fails
6. ✅ Use `vehicleId` from validation response (NOT the scanned string) for trip creation

**Mobile App Code Example:**

```javascript
// After QR code scan
async function handleQrCodeScan(scannedQrCode) {
  try {
    // Show loading indicator
    setLoading(true);
    
    // Validate QR code via API
    const response = await apiClient.get(`/vehicles/qr-code/${scannedQrCode}`);
    
    // Validation successful
    const { vehicle, vehicleId } = response.data;
    
    // Display vehicle information
    showVehicleInfo({
      plate: vehicle.plate,
      model: vehicle.model,
      brand: vehicle.brand,
      status: vehicle.status,
      vehicleId: vehicleId // Use this for trip creation
    });
    
    // Navigate to trip creation screen with vehicleId pre-filled
    navigateToCreateTrip({ vehicleId });
    
  } catch (error) {
    // Handle validation errors
    if (error.response?.status === 404) {
      showError('Vehicle not found for this QR code. Please rescan.');
    } else if (error.response?.status === 400) {
      showError('Invalid QR code format. Please rescan.');
    } else if (error.response?.status === 401) {
      // Refresh token and retry
      await refreshToken();
      return handleQrCodeScan(scannedQrCode);
    } else {
      showError('Failed to validate QR code. Please try again.');
    }
    
    // Show rescan button
    showRescanButton();
  } finally {
    setLoading(false);
  }
}
```

---

#### Step 1: Vehicle Arrives at Origin Center (Forest A)

**Agent confirms vehicle and creates trip**

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

**Note:** The `vehicleId` comes from Step 0 (QR code scan result).

**Response:**
```json
{
  "id": 1,
  "vehicleId": 17589,
  "originCenterId": 4114,
  "destinationCenterId": null,
  "purpose": "DELIVERY",
  "status": "ONGOING",
  "startedAt": "2026-02-12T10:00:00Z",
  "endedAt": null
}
```

**What happens automatically:**
- Trip is created with status `ONGOING`
- `ARRIVED` event is automatically created
- Vehicle status changes to `WAITING_IN_QUEUE`
- Vehicle `currentCenterId` is set to origin center
- **Vehicle is automatically added to the appropriate queue** (runs in background):
  - **DELIVERY trips** → Added to **LOADING** queue (vehicle loads goods to deliver)
  - **PICKUP trips** → Added to **UNLOADING** queue (vehicle unloads goods that were picked up)
- Queue position is automatically calculated from today's active queue entries
- `QUEUED` event is automatically created with queue metadata

**Queue Addition Details:**
- Queue addition runs **asynchronously in the background** - trip creation response is not blocked
- If queue addition fails, it's logged but doesn't fail trip creation
- Queue position is calculated from count of active vehicles in queue **today**
- **Daily Reset:** Positions reset each day - each day starts from position 1
- Example: If 2 vehicles are already in queue today (positions 1, 2), new vehicle gets position 3

---

#### Step 2: (Optional) Manually Add Vehicle to Queue

**Note:** This step is now **automatic** when creating a trip. You only need to manually add vehicles to queue if:
- The automatic queue addition failed (check logs)
- You need to change the queue type
- You need to add the vehicle to a different queue

```http
POST /api/v1/centers/4114/queue
Authorization: Bearer {token}
Content-Type: application/json

{
  "vehicleId": 17589,
  "tripId": 1,
  "queueType": "LOADING"
}
```

**Note:** The `centerId` in the URL can be either the center's `id` (thirdPartyId) or `geozoneId`. The API will automatically resolve it.

**Response:**
```json
{
  "id": 1,
  "centerId": 4114,
  "vehicleId": 17589,
  "tripId": 1,
  "queueType": "LOADING",
  "position": 3,
  "queuedAt": "2026-02-12T10:05:00Z",
  "serviceStartedAt": null,
  "isActive": true
}
```

**What happens:**
- Vehicle is added to queue with position automatically calculated from **today's** active queue entries
- **Daily Reset:** Positions reset each day - each day starts from position 1
- Position is set to: (count of active vehicles in queue **today**) + 1
- Example: If 2 vehicles are already in queue today (positions 1, 2), new vehicle gets position 3
- Tomorrow, positions reset and start from 1 again
- `QUEUED` event is created with metadata:
  ```json
  {
    "queue_type": "LOADING",
    "queue_position": 3
  }
  ```
- Vehicle status remains `WAITING_IN_QUEUE`
- Queue entry includes `queueDate` field set to today's date (for daily reset tracking)

---

#### Step 3: Start Service for Next Vehicle

**When loading bay becomes available, start service for the first vehicle in queue**

Vehicles are automatically added to the queue when trips are created (Step 1), so you can proceed directly to starting service. This endpoint will return a 404 error if no vehicles are in the queue (which should be rare since queue addition is automatic).

```http
POST /api/v1/centers/4114/queue/next
Authorization: Bearer {token}
Content-Type: application/json

{
  "queueType": "LOADING"
}
```

**Note:** The `centerId` in the URL can be either the center's `id` (thirdPartyId) or `geozoneId`. The API will automatically resolve it.

**Error Handling:**
- If no vehicles are in the queue, you'll receive a 404 error with a message indicating the queue is empty.
- The error message will include the center name and guidance.
- This should rarely happen since vehicles are automatically added to queue on trip creation.

**Response:**
```json
{
  "queue": {
    "id": 1,
    "centerId": 4114,
    "vehicleId": 17589,
    "tripId": 1,
    "queueType": "LOADING",
    "position": 1,
    "queuedAt": "2026-02-12T10:05:00Z",
    "serviceStartedAt": "2026-02-12T10:15:00Z",
    "isActive": false
  },
  "tripEvent": {
    "id": 3,
    "tripId": 1,
    "centerId": 4114,
    "agentId": 1231,
    "eventType": "SERVICE_STARTED",
    "timestamp": "2026-02-12T10:15:00Z",
    "metadata": {
      "service_type": "LOADING",
      "queue_wait_time": 10
    }
  }
}
```

**What happens automatically:**
- First vehicle in **today's** queue (position 1) starts service
- `SERVICE_STARTED` event is created
- Vehicle status changes to `LOADING`
- Queue entry `isActive` set to `false`
- **Queue positions are automatically renumbered:** Remaining vehicles in **today's** queue are renumbered sequentially (1, 2, 3...) to ensure no gaps
  - Example: If vehicle at position 1 leaves, vehicles at positions 2, 3, 4 become positions 1, 2, 3
  - Only affects today's queue entries (daily reset ensures clean slate each day)

---

#### Step 4: Loading Completes

**When loading finishes, create LOADING_ENDED event**

```http
POST /api/v1/trips/1/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "LOADING_ENDED",
  "centerId": 4114,
  "metadata": {
    "weight": 5000,
    "notes": "Loaded timber"
  }
}
```

**Response:**
```json
{
  "id": 4,
  "tripId": 1,
  "centerId": 4114,
  "agentId": 1231,
  "eventType": "LOADING_ENDED",
  "timestamp": "2026-02-12T10:45:00Z",
  "metadata": {
    "weight": 5000,
    "notes": "Loaded timber"
  }
}
```

**What happens automatically:**
- Vehicle status changes to `AVAILABLE`
- Vehicle remains at origin center (`currentCenterId` still set)

---

#### Step 5: Ready to Exit - Set Destination

**Vehicle is ready to leave, set destination center**

```http
POST /api/v1/trips/1/events
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

**Response:**
```json
{
  "id": 5,
  "tripId": 1,
  "centerId": 4114,
  "agentId": 1231,
  "eventType": "READY_TO_EXIT",
  "timestamp": "2026-02-12T10:50:00Z",
  "metadata": {
    "destinationCenterId": 4115
  }
}
```

**What happens automatically:**
- Trip `destinationCenterId` is updated to 4115
- Vehicle status remains `AVAILABLE`

---

#### Step 6: Vehicle Exits Origin Center

**Vehicle leaves origin center**

```http
POST /api/v1/trips/1/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "EXITED",
  "centerId": 4114
}
```

**Response:**
```json
{
  "id": 6,
  "tripId": 1,
  "centerId": 4114,
  "agentId": 1231,
  "eventType": "EXITED",
  "timestamp": "2026-02-12T10:55:00Z",
  "metadata": null
}
```

**What happens automatically:**
- Vehicle status changes to `IN_TRANSIT`
- Vehicle `currentCenterId` is set to `null`

---

#### Step 7: Vehicle Arrives at Destination Center

**Agent at destination center MUST scan and validate QR code first**

**Step 7a: Scan QR Code**
- Mobile app camera captures QR code string (e.g., "17589")

**Step 7b: Validate QR Code (REQUIRED)**

```http
GET /api/v1/vehicles/qr-code/{scannedQrCode}
Authorization: Bearer {token}
```

**Example:**
```http
GET /api/v1/vehicles/qr-code/17589
Authorization: Bearer {token}
```

**Success Response (200 OK):**
```json
{
  "vehicle": {
    "id": 17589,
    "thirdPartyId": 17589,
    "plate": "ABC-123",
    "model": "Camion",
    "brand": "Mercedes",
    "status": "IN_TRANSIT",
    "currentCenterId": null
  },
  "vehicleId": 17589,
  "qrCode": "17589"
}
```

**Note:** After successful validation, use `vehicleId` from response to create the `ARRIVED_DESTINATION` event.

**Response:**
```json
{
  "vehicle": {
    "id": 17589,
    "thirdPartyId": 17589,
    "plate": "ABC-123",
    "status": "IN_TRANSIT",
    "currentCenterId": null
  },
  "vehicleId": 17589,
  "qrCode": "17589"
}
```

**What the mobile app does:**
- Extracts `vehicleId` from response
- Displays vehicle information to agent
- **Gets active trip for vehicle:** `GET /api/v1/trips?vehicleId={vehicleId}&status=ONGOING`
- Verifies the vehicleId matches the trip's vehicleId
- Checks if trip's destinationCenterId matches current center (if set)
- Agent confirms vehicle details
- Mobile app proceeds to create ARRIVED_DESTINATION event

**Important:** The mobile app should verify that:
- Vehicle has an active trip (status = ONGOING)
- The scanned vehicleId matches the trip's vehicleId
- The trip's destinationCenterId matches the current center (if set)
- If no active trip found, show error: "Vehicle does not have an active trip"

---

**After QR scan confirmation, create ARRIVED_DESTINATION event**

```http
POST /api/v1/trips/1/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "ARRIVED_DESTINATION",
  "centerId": 4115
}
```

**Note:** 
- The `vehicleId` from QR scan should match the trip's vehicleId
- Mobile app should verify this before creating the event
- Mobile app should get the `tripId` from the vehicle's active trip (query trips with `vehicleId` and `status=ONGOING`)
- The `centerId` should be the destination center where the vehicle arrived
- If vehicle has no active trip, show error: "Vehicle does not have an active trip" and don't allow creating ARRIVED_DESTINATION event
- Use the `tripId` from the active trip response in the event creation

**Response:**
```json
{
  "id": 7,
  "tripId": 1,
  "centerId": 4115,
  "agentId": 1232,
  "eventType": "ARRIVED_DESTINATION",
  "timestamp": "2026-02-12T11:30:00Z",
  "metadata": null
}
```

**What happens automatically:**
- Vehicle status changes to `WAITING_IN_QUEUE`
- Vehicle `currentCenterId` is set to destination center (4115)

---

#### Step 8: Add to Unloading Queue

**Vehicle enters unloading queue**

```http
POST /api/v1/centers/4115/queue
Authorization: Bearer {token}
Content-Type: application/json

{
  "vehicleId": 17589,
  "tripId": 1,
  "queueType": "UNLOADING"
}
```

**Response:**
```json
{
  "id": 2,
  "centerId": 4115,
  "vehicleId": 17589,
  "tripId": 1,
  "queueType": "UNLOADING",
  "position": 1,
  "queuedAt": "2026-02-12T11:31:00Z",
  "serviceStartedAt": null,
  "isActive": true
}
```

---

#### Step 9: Start Unloading Service

**Start unloading when bay is available**

```http
POST /api/v1/centers/4115/queue/next
Authorization: Bearer {token}
Content-Type: application/json

{
  "queueType": "UNLOADING"
}
```

**Response:**
```json
{
  "queue": {
    "id": 2,
    "serviceStartedAt": "2026-02-12T11:35:00Z",
    "isActive": false
  },
  "tripEvent": {
    "eventType": "SERVICE_STARTED",
    "metadata": {
      "service_type": "UNLOADING",
      "queue_wait_time": 4
    }
  }
}
```

**What happens automatically:**
- Vehicle status changes to `UNLOADING`

---

#### Step 10: Unloading Completes

**Unloading finishes**

```http
POST /api/v1/trips/1/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "eventType": "UNLOADING_ENDED",
  "centerId": 4115,
  "metadata": {
    "weight": 5000,
    "notes": "Unloaded successfully"
  }
}
```

**Response:**
```json
{
  "id": 9,
  "eventType": "UNLOADING_ENDED",
  "timestamp": "2026-02-12T12:00:00Z"
}
```

**What happens automatically:**
- Vehicle status changes to `AVAILABLE`
- Since this is a DELIVERY trip, trip is automatically completed
- Trip status changes to `COMPLETED`
- Trip `endedAt` is set

---

## Alternative Flow: No Queue (Direct Service)

If loading/unloading bay is immediately available, skip queue steps:

1. **Create Trip** → `ARRIVED` event
2. **Create SERVICE_STARTED event directly** (skip QUEUED)
3. **Create LOADING_ENDED event**
4. Continue with exit flow...

---

## API Endpoints Reference

### QR Code Endpoints (Mobile App)

#### Validate QR Code and Get Vehicle Info (REQUIRED)
```http
GET /api/v1/vehicles/qr-code/{qrCode}
Authorization: Bearer {token}
```
**Purpose:** **MANDATORY** first step in mobile app workflow - validate scanned QR code and get vehicle information.

**⚠️ IMPORTANT:** This endpoint **validates** the QR code. Do NOT use the scanned QR string directly as vehicleId. Always use the `vehicleId` from the validation response.

**Path Parameters:**
- `qrCode`: The scanned QR code string from camera (e.g., "17589")

**Headers:**
- `Authorization: Bearer {token}` - Required JWT token

**Success Response (200 OK):**
```json
{
  "vehicle": {
    "id": 17589,
    "thirdPartyId": 17589,
    "plate": "ABC-123",
    "model": "Camion",
    "brand": "Mercedes",
    "status": "AVAILABLE",
    "currentCenterId": null,
    "centerId": null,
    "isActive": true,
    "accountId": 267
  },
  "vehicleId": 17589,
  "qrCode": "17589"
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "statusCode": 404,
  "message": "Vehicle not found for QR code. The QR code may be invalid or belong to a different account.",
  "error": "Not Found"
}
```

**400 Bad Request:**
```json
{
  "statusCode": 400,
  "message": "Invalid QR code: vehicle ID is not valid",
  "error": "Bad Request"
}
```

**401 Unauthorized:**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

**Mobile App Usage (Step-by-Step):**
1. ✅ User scans QR code with camera → QR string captured (e.g., "17589")
2. ✅ **IMMEDIATELY** call this endpoint with scanned QR code string
3. ✅ **Validate response:**
   - If 200 OK: Extract `vehicleId` from response
   - If 404/400: Show error message, allow rescan
   - If 401: Refresh token and retry
4. ✅ Display vehicle information to agent for confirmation
5. ✅ Agent confirms vehicle details
6. ✅ **Use `vehicleId` from validation response** (NOT scanned string) for subsequent trip operations

**Example cURL:**
```bash
curl -X 'GET' \
  'http://localhost:5001/api/v1/vehicles/qr-code/17589' \
  -H 'accept: */*' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

---

### Trips Endpoints

#### Create Trip
```http
POST /api/v1/trips
```
Creates a new trip and automatically creates `ARRIVED` event.

#### Get All Trips
```http
GET /api/v1/trips?page=1&limit=10&vehicleId=17589&status=ONGOING&include=vehicle,originCenter,events
```
Query parameters:
- `page`, `limit`: Pagination
- `vehicleId`: Filter by vehicle
- `originCenterId`, `destinationCenterId`: Filter by centers
- `status`: Filter by trip status (ONGOING, COMPLETED)
- `purpose`: Filter by purpose (DELIVERY, PICKUP)
- `search`: Search term
- `sortBy`, `sortOrder`: Sorting
- `include`: Comma-separated relations (vehicle, originCenter, destinationCenter, events)

#### Get Trip by ID
```http
GET /api/v1/trips/1?include=vehicle,originCenter,destinationCenter,events
```

#### Create Trip Event
```http
POST /api/v1/trips/1/events
```
Creates an event and automatically updates vehicle status.

#### Complete Trip
```http
POST /api/v1/trips/1/complete
```
Manually complete a trip (usually automatic for DELIVERY trips after UNLOADING_ENDED).

---

### Queue Endpoints

#### Add Vehicle to Queue (Automatic)
**✅ AUTOMATIC:** Vehicles are automatically added to the appropriate queue when trips are created:
- **DELIVERY trips** → Automatically added to **LOADING** queue
- **PICKUP trips** → Automatically added to **UNLOADING** queue

Queue addition runs asynchronously in the background and doesn't block trip creation.

#### Manually Add Vehicle to Queue (Optional)
```http
POST /api/v1/centers/{centerId}/queue
```
**Note:** This is now optional since queue addition is automatic. Use this endpoint only if:
- You need to manually add a vehicle to queue
- The automatic queue addition failed (check logs)
- You need to change the queue type

**Note:** The `centerId` in the URL can be either the center's `id` (thirdPartyId) or `geozoneId`. The API will automatically resolve it.

**Position Calculation:**
- Queue position is **automatically calculated** from the count of existing active vehicles in the queue **today**
- Position = (number of active vehicles today) + 1
- Ensures sequential positions (1, 2, 3...) without gaps
- **Daily Reset:** Positions reset each day - each day starts from position 1
- Example: If 2 vehicles are in queue today, new vehicle gets position 3

#### Start Next Service
```http
POST /api/v1/centers/{centerId}/queue/next
```
Starts service for first vehicle in queue and creates `SERVICE_STARTED` event.

**Note:** The `centerId` in the URL can be either the center's `id` (thirdPartyId) or `geozoneId`. The API will automatically resolve it.

**Error Handling:**
- Returns 404 if no vehicles are in the queue
- Error message includes center name and guidance
- This should rarely happen since vehicles are automatically added to queue on trip creation

**Position Renumbering:**
- When a vehicle starts service, it is removed from the queue
- Remaining vehicles are **automatically renumbered** sequentially (1, 2, 3...)
- Ensures queue positions are always sequential without gaps
- Example: Vehicle at position 1 leaves → Vehicles at positions 2, 3, 4 become positions 1, 2, 3

#### Get Queue
```http
GET /api/v1/centers/{centerId}/queue?type=LOADING&isActive=true&date=2026-02-12
```
Returns queue list with **position and type clearly visible**. By default, returns **today's queue** (positions reset daily).

**Response includes:**
- `position`: Queue position (1, 2, 3...) - resets daily
- `queueType`: Queue type (LOADING | UNLOADING)
- `queueTypeLabel`: Human-readable label ("Loading Queue" | "Unloading Queue")
- `positionDisplay`: Formatted display ("Position 1 of 5")
- `vehicle`: Vehicle information
- `trip`: Trip information
- `waitingTimeMinutes`: Waiting time in minutes

Query parameters:
- `type`: Filter by queue type (LOADING, UNLOADING)
- `isActive`: Filter active queues (default: true)
- `date`: Get queue for specific date (YYYY-MM-DD). Default: today

**Example Response:**
```json
[
  {
    "id": 1,
    "centerId": 4114,
    "vehicleId": 17589,
    "tripId": 1,
    "queueType": "LOADING",
    "queueTypeLabel": "Loading Queue",
    "position": 1,
    "positionDisplay": "Position 1 of 3",
    "queuedAt": "2026-02-12T10:05:00Z",
    "queueDate": "2026-02-12T00:00:00Z",
    "isActive": true,
    "waitingTimeMinutes": 10,
    "vehicle": {
      "id": 17589,
      "plate": "ABC-123"
    },
    "trip": {
      "id": 1,
      "status": "ONGOING"
    }
  }
]
```

#### Get All Vehicles in Queue
```http
GET /api/v1/centers/{centerId}/queue/vehicles?type=LOADING&isActive=true&date=2026-02-12
```
Returns a list of **all vehicles** currently in the queue at the center. Same filters as Get Queue (`type`, `isActive`, `date`). Use this when you need a vehicle-focused list (e.g. for dashboards or vehicle lookup).

**Response:**
```json
{
  "vehicles": [
    {
      "vehicle": { "id": 17589, "plate": "ABC-123", ... },
      "queueEntryId": 1,
      "position": 1,
      "queueType": "LOADING",
      "queueTypeLabel": "Loading Queue",
      "waitingTimeMinutes": 10,
      "tripId": 1,
      "isActive": true
    }
  ]
}
```

#### Get Queue Summary
```http
GET /api/v1/centers/{centerId}/queue/summary
```
Returns queue summary showing position and type clearly for both LOADING and UNLOADING queues.

**Response:**
```json
{
  "centerId": 4114,
  "date": "2026-02-12",
  "loadingQueue": {
    "total": 5,
    "active": 3,
    "positions": [
      { "position": 1, "vehicleId": 17589, "plate": "ABC-123" },
      { "position": 2, "vehicleId": 17590, "plate": "XYZ-456" },
      { "position": 3, "vehicleId": 17591, "plate": "DEF-789" }
    ]
  },
  "unloadingQueue": {
    "total": 2,
    "active": 2,
    "positions": [
      { "position": 1, "vehicleId": 17592, "plate": "GHI-012" },
      { "position": 2, "vehicleId": 17593, "plate": "JKL-345" }
    ]
  }
}
```

---

## Queue Position Management & Daily Reset

### Daily Position Reset

Queue positions **reset automatically each day** at midnight. This provides a realistic daily reset for operations:

- **Each day starts fresh:** Positions begin at 1 each day
- **Automatic calculation:** Positions are calculated from count of today's active vehicles
- **No manual management:** System handles position assignment automatically
- **Historical data preserved:** Old queue entries remain in database but don't affect new day's positions

### How Daily Reset Works

1. **Queue Date Tracking:**
   - Each queue entry has a `queueDate` field set to the start of the day (00:00:00)
   - Example: All queues created on Feb 12, 2026 have `queueDate = 2026-02-12T00:00:00Z`

2. **Position Calculation:**
   - When adding to queue, system counts only **today's** active vehicles
   - Position = (count of today's active vehicles) + 1
   - Example on Feb 12:
     - First vehicle: position 1
     - Second vehicle: position 2
     - Third vehicle: position 3

3. **Next Day Reset:**
   - On Feb 13, positions reset
   - First vehicle on Feb 13: position 1 (not continuing from Feb 12)
   - This provides realistic daily operations tracking

### Queue Visibility

Queue responses clearly show:
- **Position:** Sequential number (1, 2, 3...)
- **Queue Type:** LOADING or UNLOADING
- **Queue Type Label:** Human-readable ("Loading Queue" | "Unloading Queue")
- **Position Display:** Formatted string ("Position 1 of 5")
- **Date:** Queue date for daily tracking

### Example: Daily Reset Scenario

**Day 1 (Feb 12):**
- Vehicle A enters queue → Position 1
- Vehicle B enters queue → Position 2
- Vehicle C enters queue → Position 3

**Day 2 (Feb 13):**
- Vehicle D enters queue → Position 1 (reset!)
- Vehicle E enters queue → Position 2
- Vehicle F enters queue → Position 3

**Querying queues:**
- `GET /centers/4114/queue?date=2026-02-12` → Shows Day 1 queues (positions 1, 2, 3)
- `GET /centers/4114/queue` (today) → Shows Day 2 queues (positions 1, 2, 3)

---

## Event Sequence Diagrams

### Complete Delivery Flow

```
Mobile App: Scan QR Code
    ↓
[GET /vehicles/qr-code/{qrCode}] → Get Vehicle Info
    ↓
Mobile App: Display Vehicle Details
Agent Confirms Vehicle
    ↓
Vehicle Arrives at Center
    ↓
[POST /trips] → Trip Created + ARRIVED Event
    ↓
Vehicle Status: WAITING_IN_QUEUE
    ↓
[POST /centers/{id}/queue] → QUEUED Event
    ↓
Waiting in Queue...
    ↓
[POST /centers/{id}/queue/next] → SERVICE_STARTED Event
    ↓
Vehicle Status: LOADING
    ↓
[POST /trips/{id}/events] → LOADING_ENDED Event
    ↓
Vehicle Status: AVAILABLE
    ↓
[POST /trips/{id}/events] → READY_TO_EXIT Event (sets destination)
    ↓
[POST /trips/{id}/events] → EXITED Event
    ↓
Vehicle Status: IN_TRANSIT
    ↓
Mobile App: Scan QR Code at Destination
[GET /vehicles/qr-code/{qrCode}] → Get Vehicle Info
    ↓
Agent Confirms Vehicle
    ↓
[POST /trips/{id}/events] → ARRIVED_DESTINATION Event
    ↓
Vehicle Status: WAITING_IN_QUEUE
    ↓
[POST /centers/{id}/queue] → QUEUED Event (UNLOADING)
    ↓
[POST /centers/{id}/queue/next] → SERVICE_STARTED Event
    ↓
Vehicle Status: UNLOADING
    ↓
[POST /trips/{id}/events] → UNLOADING_ENDED Event
    ↓
Trip Auto-Completed (DELIVERY)
Vehicle Status: AVAILABLE
```

---

## Mobile App Integration Guide

### Step-by-Step Mobile App Flow

#### At Origin Center (Creating Trip)

1. **Agent opens mobile app and navigates to "Scan QR Code"**
2. **Camera opens, agent scans vehicle QR code**
3. **App calls:** `GET /api/v1/vehicles/qr-code/{scannedQrCode}`
4. **App receives vehicle information**
5. **App displays:**
   - Vehicle plate number
   - Vehicle model/brand
   - Current status
   - Current location (if any)
6. **Agent confirms:** "Yes, this is the correct vehicle"
7. **App proceeds to:** "Create Trip" screen
8. **App pre-fills:** `vehicleId` from QR scan response
9. **Agent selects:** Origin center (or uses GPS location)
10. **App creates trip:** `POST /api/v1/trips` with vehicleId from QR scan

#### At Destination Center (Vehicle Arrival)

1. **Agent opens mobile app and navigates to "Scan QR Code"**
2. **Camera opens, agent scans vehicle QR code**
3. **App calls:** `GET /api/v1/vehicles/qr-code/{scannedQrCode}`
4. **App receives vehicle information**
5. **App displays:**
   - Vehicle plate number
   - Vehicle model/brand
   - Current status (should be `IN_TRANSIT`)
   - Active trip information (if vehicle has active trip)
6. **App verifies:** Vehicle has active trip and vehicleId matches
7. **Agent confirms:** "Yes, this is the correct vehicle"
8. **App proceeds to:** "Record Arrival" screen
9. **App pre-fills:** `tripId` from active trip, `centerId` from current center
10. **App creates event:** `POST /api/v1/trips/{tripId}/events` with `ARRIVED_DESTINATION`

### QR Code Format

- QR codes contain the vehicle's `thirdPartyId` (vehicleId) as a string
- QR codes are encrypted in the database but decrypted for validation
- Example QR code value: `"17589"` (string representation of vehicleId)

### Error Handling for QR Code Scanning

#### Invalid QR Code Format
```json
{
  "statusCode": 400,
  "message": "Invalid QR code: vehicle ID is not valid"
}
```
**Solution:** Show error message: "Invalid QR code. Please scan again."

#### Vehicle Not Found
```json
{
  "statusCode": 404,
  "message": "Vehicle not found for QR code. The QR code may be invalid or belong to a different account."
}
```
**Solution:** Show error message: "Vehicle not found. This QR code may be invalid or belong to a different account."

---

## Error Handling

### Common Errors

#### Vehicle Already Has Active Trip
```json
{
  "statusCode": 400,
  "message": "Vehicle 17589 already has an active trip"
}
```
**Solution**: Complete or cancel existing trip first.

#### Vehicle Already in Queue
```json
{
  "statusCode": 400,
  "message": "Vehicle 17589 is already in LOADING queue at center 4114"
}
```
**Solution**: Check queue status or remove from queue first.

#### No Vehicles in Queue
```json
{
  "statusCode": 404,
  "message": "No vehicles in LOADING queue at center 4114"
}
```
**Solution**: Ensure vehicles are added to queue first.

#### Trip Not Found
```json
{
  "statusCode": 404,
  "message": "Trip 1 not found"
}
```
**Solution**: Verify trip ID and account ID.

---

## Best Practices

1. **Always scan QR code first** 
   - **At Origin Center:** Mobile app must validate QR code and get vehicleId before creating trip
   - **At Destination Center:** Mobile app must scan QR code before creating ARRIVED_DESTINATION event
   - Verify scanned vehicle matches expected vehicle/trip

2. **Display vehicle info** - Show vehicle details to agent for confirmation after QR scan

3. **Always check vehicle status** before creating new trip (vehicle may already have active trip)

4. **Verify vehicle matches trip** - At destination, ensure scanned vehicleId matches the trip's vehicleId before creating ARRIVED_DESTINATION event

5. **Use queue system** when bays are busy to ensure fair processing
   - Queue positions reset daily (realistic for daily operations)
   - Positions are automatically calculated (no manual entry needed)
   - Queue type (LOADING/UNLOADING) is clearly visible in all responses

6. **Display queue information clearly** - Show queue position and type prominently in UI
   - Use `positionDisplay` field: "Position 1 of 5"
   - Use `queueTypeLabel` field: "Loading Queue" or "Unloading Queue"

7. **Track events chronologically** - events are immutable

8. **Include relations** when fetching trips for complete context

9. **Monitor queue wait times** for performance optimization

10. **Complete trips** explicitly for PICKUP trips (DELIVERY auto-completes)

11. **Handle QR code errors gracefully** - Invalid QR codes should show clear error messages to agent

12. **Daily queue reset** - Understand that positions reset each day at midnight
   - Each day starts with position 1
   - Historical queue data is preserved but positions reset for new day

---

## Example: Get Trip Timeline

```http
GET /api/v1/trips/1?include=events
```

**Response:**
```json
{
  "id": 1,
  "vehicleId": 17589,
  "status": "COMPLETED",
  "events": [
    {
      "id": 1,
      "eventType": "ARRIVED",
      "timestamp": "2026-02-12T10:00:00Z",
      "centerId": 4114
    },
    {
      "id": 2,
      "eventType": "QUEUED",
      "timestamp": "2026-02-12T10:05:00Z",
      "metadata": { "queue_position": 3 }
    },
    {
      "id": 3,
      "eventType": "SERVICE_STARTED",
      "timestamp": "2026-02-12T10:15:00Z"
    },
    {
      "id": 4,
      "eventType": "LOADING_ENDED",
      "timestamp": "2026-02-12T10:45:00Z"
    },
    {
      "id": 5,
      "eventType": "READY_TO_EXIT",
      "timestamp": "2026-02-12T10:50:00Z"
    },
    {
      "id": 6,
      "eventType": "EXITED",
      "timestamp": "2026-02-12T10:55:00Z"
    },
    {
      "id": 7,
      "eventType": "ARRIVED_DESTINATION",
      "timestamp": "2026-02-12T11:30:00Z",
      "centerId": 4115
    },
    {
      "id": 8,
      "eventType": "QUEUED",
      "timestamp": "2026-02-12T11:31:00Z",
      "metadata": { "queue_type": "UNLOADING" }
    },
    {
      "id": 9,
      "eventType": "SERVICE_STARTED",
      "timestamp": "2026-02-12T11:35:00Z"
    },
    {
      "id": 10,
      "eventType": "UNLOADING_ENDED",
      "timestamp": "2026-02-12T12:00:00Z"
    }
  ]
}
```

This provides a complete audit trail of the trip!
