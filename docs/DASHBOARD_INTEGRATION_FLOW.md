# Dashboard Integration Workflow

This document describes how to integrate a web dashboard with the Proof Arrive API to monitor vehicle movements, manage queues, track trips, and view real-time operational data. It reflects the **refactored trip-centric API**: trips use **phase**-based lifecycle; vehicle status is derived from trip events; stats and reports live under `/reports`.

## Table of Contents
1. [Overview](#overview)
2. [Dashboard Architecture](#dashboard-architecture)
3. [Authentication & Setup](#authentication--setup) *(Reference - Already Implemented)*
4. [Dashboard API Endpoints Reference](#dashboard-api-endpoints-reference)
5. [Dashboard Reporting & Stats](#dashboard-reporting--stats-reference-for-implementation) *(endpoints + filter options for stats implementation)*
6. [Copy-paste for dashboard](#copy-paste-for-dashboard-update-when-api-changes) *(paste into dashboard repo; update when API changes)*
7. [Key Dashboard Views](#key-dashboard-views)
8. [Real-Time Monitoring](#real-time-monitoring)
9. [Data Refresh Strategies](#data-refresh-strategies)
10. [Filtering & Search Patterns](#filtering--search-patterns)
11. [Error Handling](#error-handling)
12. [Performance Optimization](#performance-optimization)
13. [Example Dashboard Flows](#example-dashboard-flows)

---

## Overview

The dashboard provides real-time visibility into:
- **Vehicle Status**: Current location, status, and active trips
- **Trip Tracking**: Ongoing and completed trips between centers
- **Queue Management**: Real-time queue positions and wait times
- **Center Operations**: Vehicles at each center, queue status
- **Operational Metrics**: Summary statistics and analytics

### Key Features

- **Multi-Tenant**: All data automatically filtered by account ID
- **Real-Time Updates**: Polling or WebSocket support for live data
- **Filtering & Search**: Advanced filtering by status, center, date, etc.
- **Pagination**: Efficient handling of large datasets
- **Relations Loading**: Optional loading of related entities (vehicles, centers, events)

---

## Dashboard Architecture

### Recommended Stack

```
┌─────────────────────────────────────────────────────────┐
│              Dashboard Frontend (React/Vue)            │
│  - State Management (Redux/Vuex)                       │
│  - API Client (Axios/Fetch)                            │
│  - Real-Time Updates (Polling/WebSocket)                │
└────────────────────┬────────────────────────────────────┘
                     │
                     │ HTTP/REST API
                     │ JWT Authentication
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Proof Arrive API                           │
│  - Trips & Trip Events                                  │
│  - Queue Management                                     │
│  - Vehicle Tracking                                     │
│  - Reports & Analytics                                  │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Initial Load**: Fetch summary data and key metrics
2. **View Navigation**: Load specific data based on selected view
3. **Real-Time Updates**: Poll endpoints or use WebSocket for live updates
4. **User Actions**: Filter, search, sort, and paginate data

---

## Authentication & Setup

> **Note**: This section is provided as reference. If your dashboard already has authentication implemented, you can skip this section and proceed directly to [Key Dashboard Views](#key-dashboard-views).

### Prerequisites

Ensure your dashboard API client is configured with:
- ✅ JWT token authentication (`Authorization: Bearer <token>` header)
- ✅ Token refresh mechanism for expired tokens
- ✅ Base URL pointing to `/api/v1` endpoints
- ✅ Error handling for 401 Unauthorized responses

### API Client Configuration

Your existing API client should be configured similar to:

```javascript
// Example: Ensure your API client includes authentication headers
const apiClient = axios.create({
  baseURL: 'https://api.proofarrive.com/api/v1',
  headers: {
    'Authorization': `Bearer ${getAccessToken()}`, // Use your existing token getter
    'Content-Type': 'application/json'
  }
});
```

### Available Auth Endpoints (Reference)

- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `GET /api/v1/auth/check` - Check authentication status

All dashboard endpoints require a valid JWT token in the `Authorization` header.

---

## Dashboard API Endpoints Reference

Base URL for all endpoints: **`/api/v1`**. All require **JWT** in `Authorization: Bearer <token>` unless noted.

### Trips

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/trips` | Create a new trip. Body: `{ vehicleId, originCenterId, purpose: "DELIVERY" \| "PICKUP" }`. Trip starts in phase `AT_ORIGIN_ARRIVED`. |
| `GET` | `/trips` | List trips with filters and pagination. Query: `page`, `limit`, `vehicleId`, `originCenterId`, `destinationCenterId`, `centerId`, `status` (ONGOING \| COMPLETED), `purpose` (DELIVERY \| PICKUP), `phase`, `search`, `sortBy`, `sortOrder`, `createdAt`, `include` (vehicle,originCenter,destinationCenter,events). |
| `GET` | `/trips/:id` | Get one trip. Query: `include` (vehicle,originCenter,destinationCenter,events). Response includes `phase` and `status`. |
| `POST` | `/trips/:id/start-loading` | Start loading at origin. Valid phase: `AT_ORIGIN_ARRIVED` → `AT_ORIGIN_LOADING`. |
| `POST` | `/trips/:id/end-loading` | End loading at origin. Valid phase: `AT_ORIGIN_LOADING` → `AT_ORIGIN_LOADING_ENDED`. |
| `POST` | `/trips/:id/set-destination` | Set destination and mark ready to exit. Body: `{ destinationCenterId }`. Valid phase: `AT_ORIGIN_LOADING_ENDED` → `READY_TO_EXIT`. |
| `POST` | `/trips/:id/exit-origin` | Record vehicle exited origin. Valid phase: `READY_TO_EXIT` → `IN_TRANSIT`. |
| `POST` | `/trips/:id/arrive-destination` | Record arrival at destination. Valid phase: `IN_TRANSIT` → `AT_DESTINATION_ARRIVED`. |
| `POST` | `/trips/:id/start-unloading` | Start unloading at destination. Valid phase: `AT_DESTINATION_ARRIVED` → `AT_DESTINATION_UNLOADING`. |
| `POST` | `/trips/:id/end-unloading` | End unloading; DELIVERY auto-completes, PICKUP → `AT_DESTINATION_UNLOADING_ENDED`. |
| `POST` | `/trips/:id/complete` | Manually complete trip. Valid phase: `AT_DESTINATION_UNLOADING_ENDED` → `COMPLETED`. |

### Trip events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/trips/:id/events` | Create a trip event. Body: `{ eventType, centerId, metadata? }`. Events are immutable; vehicle status is updated from trip phase/events. |

### Stats (reports)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/reports/dashboard` | Dashboard summary: vehicles by status (incl. IN_GARAGE), trips (ongoing, completed, by purpose/phase), queue counts, centers. Query: `startDate`, `endDate`, `centerId`, `vehicleId`, `agentId`, `groupBy`. **If no `startDate`/`endDate` are provided, trip-related metrics default to the current day.** |
| `GET` | `/reports/trips/summary` | Trips stats: ongoing count, completed in period, total started, completion rate, by status/purpose/phase. Query: `startDate`, `endDate`, `centerId`, `vehicleId`. **If no `startDate`/`endDate` are provided, the report defaults to trips for the current day.** |
| `GET` | `/reports/trips/by-date` | Trip counts grouped by day/week/month (for charts). Query: `startDate`, `endDate`, `centerId`, `vehicleId`, `groupBy` (day \| week \| month). **If no `startDate`/`endDate` are provided, the range defaults to the current day.** |
| `GET` | `/reports/trips/by-center` | Per-center trip counts: as origin, as destination, completed at destination. Query: `startDate`, `endDate`, `centerId`, `vehicleId`. **Defaults to current day when no dates are provided.** |
| `GET` | `/reports/trips/by-origin-destination` | OD matrix: trip counts by (originCenterId, destinationCenterId). Query: `startDate`, `endDate`, `centerId`, `vehicleId`. **Defaults to current day when no dates are provided.** |
| `GET` | `/reports/trips/completion-rate` | In period: started count, completed count, completion rate (%). Query: `startDate`, `endDate`, `centerId`, `vehicleId`. **Defaults to current day when no dates are provided.** |
| `GET` | `/reports/queues/summary` | Queue stats: global loading/unloading active counts, per-center breakdown. Query: `startDate`, `endDate`, `centerId`. |
| `GET` | `/reports/queues/by-center` | Per-center: loading total/active, unloading total/active. Query: `startDate`, `endDate`, `centerId`. |
| `GET` | `/reports/queues/by-date` | Queue activity over time (for charts). Query: `startDate`, `endDate`, `centerId`. |

### Vehicles – availability by status

Vehicle status values: `AVAILABLE`, `IN_TRANSIT`, `WAITING_IN_QUEUE`, `LOADING`, `UNLOADING`, `IN_GARAGE`. Status is derived from the latest trip/event, not set manually.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/vehicles` | List vehicles with pagination, search, sort, **status filter**. Query: `page`, `limit`, **`status`** (enum: AVAILABLE, IN_TRANSIT, WAITING_IN_QUEUE, LOADING, UNLOADING, IN_GARAGE), `search`, `searchBy`, `sortBy`, `include` (qrCodes, group, assignedCenter, currentCenter). |
| `GET` | `/vehicles/status-summary` | Counts by status: `{ AVAILABLE: n, IN_TRANSIT: n, WAITING_IN_QUEUE: n, LOADING: n, UNLOADING: n, IN_GARAGE: n }`. Use for dashboard availability cards. |
| `GET` | `/vehicles/by-status/:status` | All vehicles with the given status. **Path param `status`**: enum (AVAILABLE, IN_TRANSIT, WAITING_IN_QUEUE, LOADING, UNLOADING, IN_GARAGE); case-insensitive. Use for “Vehicles by status” lists; Swagger shows dropdown. |
| `GET` | `/vehicles/by-center/:centerId` | All vehicles currently at the given center (`currentCenterId`). |
| `GET` | `/vehicles/:id` | Single vehicle details. Query: `include` (qrCodes, group, assignedCenter, currentCenter). |
| `PUT` | `/vehicles/:id/assignment` | Update single vehicle’s center assignment. Body: `{ centerId }` or `{ centerId: null }` to clear. |

### Bulk assign vehicles to centers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PUT` | `/vehicles/assignments/bulk` | Assign multiple vehicles to centers in one request. Body: `{ assignments: [ { vehicleId, centerId }, ... ] }`. `centerId` can be `null` to clear current location. Returns `{ updatedCount, results: [ { vehicleId, centerId, success, error? } ] }`. |

---

## Dashboard Reporting & Stats (reference for implementation)

Use this section when implementing stats and reporting on the dashboard. All report endpoints are under **`/api/v1/reports`**. Trip reports **default to the current day** when `startDate` and `endDate` are omitted.

### Report endpoints and filter options

| Endpoint | Method | Filter options (query params) | Default / notes |
|----------|--------|-------------------------------|------------------|
| `/reports/dashboard` | `GET` | `startDate`, `endDate` (ISO), `centerId`, `vehicleId`, `agentId`, `groupBy` (day \| week \| month) | Trip metrics default to **today** if no dates. Returns vehicles by status, trips (ongoing/completed/by purpose/phase), queues, centers. |
| `/reports/trips/summary` | `GET` | `startDate`, `endDate`, `centerId`, `vehicleId` | **Today** if no dates. Returns ongoing count, completed in period, total started, completion rate %, by status/purpose/phase. |
| `/reports/trips/by-date` | `GET` | `startDate`, `endDate`, `centerId`, `vehicleId`, `groupBy` (day \| week \| month) | **Today** if no dates. Returns trip counts grouped by period (for charts). |
| `/reports/trips/by-center` | `GET` | `startDate`, `endDate`, `centerId`, `vehicleId` | **Today** if no dates. Per-center: as origin, as destination, completed at destination. |
| `/reports/trips/by-origin-destination` | `GET` | `startDate`, `endDate`, `centerId`, `vehicleId` | **Today** if no dates. OD matrix: counts by (originCenterId, destinationCenterId). |
| `/reports/trips/completion-rate` | `GET` | `startDate`, `endDate`, `centerId`, `vehicleId` | **Today** if no dates. Returns startedInPeriod, completedInPeriod, completionRatePercent. |
| `/reports/queues/summary` | `GET` | `startDate`, `endDate`, `centerId` | Default range: today. Loading/unloading active counts (global + per-center). |
| `/reports/queues/by-center` | `GET` | `startDate`, `endDate`, `centerId` | Default range: today. Per-center loading/unloading total and active. |
| `/reports/queues/by-date` | `GET` | `startDate`, `endDate`, `centerId` | Default: last 7 days. Queue activity over time (for charts). |

### Vehicle status (for filters and dropdowns)

Use these values for **vehicle status** filters and UI dropdowns (e.g. `GET /vehicles?status=...`, `GET /vehicles/by-status/:status`). Swagger exposes them as enums for both the list filter and the by-status path param.

| Value | Label (for UI) |
|-------|----------------|
| `AVAILABLE` | Available |
| `IN_TRANSIT` | In transit |
| `WAITING_IN_QUEUE` | Waiting in queue |
| `LOADING` | Loading |
| `UNLOADING` | Unloading |
| `IN_GARAGE` | In garage |

**Endpoints using vehicle status:**
- **List with filter:** `GET /api/v1/vehicles?status=AVAILABLE` (optional query param; Swagger dropdown).
- **By status:** `GET /api/v1/vehicles/by-status/AVAILABLE` (path param; Swagger dropdown; case-insensitive).
- **Counts:** `GET /api/v1/vehicles/status-summary` returns `{ AVAILABLE: n, IN_TRANSIT: n, ... }`.

### Quick copy-paste: report query params

- **Date range:** `startDate`, `endDate` — ISO 8601 (e.g. `2025-03-01`, `2025-03-02T23:59:59Z`).
- **Scope:** `centerId`, `vehicleId`, `agentId` (where applicable).
- **Grouping:** `groupBy` = `day` | `week` | `month` (for by-date endpoints).

---

## Copy-paste for dashboard (update when API changes)

**Use this:** Copy the block below into your dashboard project (e.g. `src/api/dashboardEndpoints.ts` or `DASHBOARD_API_REFERENCE.md`). When the Proof Arrive API is updated, re-copy from this doc to keep your dashboard in sync.

**Base URL:** `https://your-api-host/api/v1` (or `process.env.VITE_API_BASE_URL` / `NEXT_PUBLIC_API_URL`). All requests need `Authorization: Bearer <token>`.

---

### Block 1: Endpoints config (paste into dashboard codebase)

```javascript
// Proof Arrive API – dashboard endpoints
// Update this when the API changes (see docs/DASHBOARD_INTEGRATION_FLOW.md)

const API_BASE = '/api/v1'; // or your full base URL

export const DASHBOARD_ENDPOINTS = {
  // —— Auth ——
  auth: {
    login: () => `${API_BASE}/auth/login`,
    refresh: () => `${API_BASE}/auth/refresh-token`,
    check: () => `${API_BASE}/auth/check`,
  },

  // —— Overview ——
  overview: {
    dashboard: (params = {}) => `${API_BASE}/reports/dashboard?${new URLSearchParams(params)}`,
    vehicleStatusSummary: () => `${API_BASE}/vehicles/status-summary`,
    activeTrips: (params = { limit: 10 }) => `${API_BASE}/trips?${new URLSearchParams({ status: 'ONGOING', ...params })}`,
    centers: (params = {}) => `${API_BASE}/centers?${new URLSearchParams(params)}`,
  },

  // —— Trips ——
  trips: {
    list: (params = {}) => `${API_BASE}/trips?${new URLSearchParams(params)}`,
    one: (id, params = {}) => `${API_BASE}/trips/${id}?${new URLSearchParams(params)}`,
  },

  // —— Reports / stats (trip reports default to today if no startDate/endDate) ——
  reports: {
    dashboard: (params = {}) => `${API_BASE}/reports/dashboard?${new URLSearchParams(params)}`,
    tripsSummary: (params = {}) => `${API_BASE}/reports/trips/summary?${new URLSearchParams(params)}`,
    tripsByDate: (params = {}) => `${API_BASE}/reports/trips/by-date?${new URLSearchParams(params)}`,
    tripsByCenter: (params = {}) => `${API_BASE}/reports/trips/by-center?${new URLSearchParams(params)}`,
    tripsByOriginDestination: (params = {}) => `${API_BASE}/reports/trips/by-origin-destination?${new URLSearchParams(params)}`,
    tripsCompletionRate: (params = {}) => `${API_BASE}/reports/trips/completion-rate?${new URLSearchParams(params)}`,
    queuesSummary: (params = {}) => `${API_BASE}/reports/queues/summary?${new URLSearchParams(params)}`,
    queuesByCenter: (params = {}) => `${API_BASE}/reports/queues/by-center?${new URLSearchParams(params)}`,
    queuesByDate: (params = {}) => `${API_BASE}/reports/queues/by-date?${new URLSearchParams(params)}`,
  },

  // —— Vehicles ——
  vehicles: {
    list: (params = {}) => `${API_BASE}/vehicles?${new URLSearchParams(params)}`,
    byStatus: (status) => `${API_BASE}/vehicles/by-status/${status}`,
    byCenter: (centerId) => `${API_BASE}/vehicles/by-center/${centerId}`,
    statusSummary: () => `${API_BASE}/vehicles/status-summary`,
    one: (id, params = {}) => `${API_BASE}/vehicles/${id}?${new URLSearchParams(params)}`,
    assignment: (id) => `${API_BASE}/vehicles/${id}/assignment`,
    bulkAssignments: () => `${API_BASE}/vehicles/assignments/bulk`,
  },

  // —— Centers & queues ——
  centers: {
    list: (params = {}) => `${API_BASE}/centers?${new URLSearchParams(params)}`,
    one: (id) => `${API_BASE}/centers/${id}`,
    queue: (centerId, params = {}) => `${API_BASE}/centers/${centerId}/queue?${new URLSearchParams(params)}`,
    queueSummary: (centerId) => `${API_BASE}/centers/${centerId}/queue/summary`,
    queueNext: (centerId) => `${API_BASE}/centers/${centerId}/queue/next`,
  },
};

// Report query params (use when calling reports.*)
// startDate, endDate (ISO); centerId, vehicleId, agentId; groupBy: 'day'|'week'|'month'

// Vehicle status – use for filters and dropdowns
export const VEHICLE_STATUS_OPTIONS = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'IN_TRANSIT', label: 'In transit' },
  { value: 'WAITING_IN_QUEUE', label: 'Waiting in queue' },
  { value: 'LOADING', label: 'Loading' },
  { value: 'UNLOADING', label: 'Unloading' },
  { value: 'IN_GARAGE', label: 'In garage' },
];

// Trips list filter params: page, limit, status (ONGOING|COMPLETED), phase, vehicleId,
// originCenterId, destinationCenterId, centerId, purpose (DELIVERY|PICKUP), search, sortBy, sortOrder, createdAt, include
```

---

### Block 2: One-page reference (paste into a .md file in dashboard repo)

```markdown
# Dashboard API reference (Proof Arrive)
Update from: proof-arrive-api/docs/DASHBOARD_INTEGRATION_FLOW.md when API changes.

Base: GET/POST/PUT to /api/v1 with header: Authorization: Bearer <token>

| What | Method | Path | Key params |
|------|--------|------|------------|
| Overview | GET | /reports/dashboard | startDate, endDate, centerId, vehicleId (default: today) |
| Vehicle status counts | GET | /vehicles/status-summary | — |
| Active trips | GET | /trips | status=ONGOING, limit |
| Centers list | GET | /centers | page, limit |
| Trips list | GET | /trips | page, limit, status, phase, vehicleId, originCenterId, destinationCenterId, centerId, purpose, search, sortBy, sortOrder, createdAt, include |
| Trip detail | GET | /trips/:id | include=vehicle,originCenter,destinationCenter,events |
| Trips summary | GET | /reports/trips/summary | startDate, endDate, centerId, vehicleId (default: today) |
| Trips by date | GET | /reports/trips/by-date | startDate, endDate, centerId, vehicleId, groupBy (day|week|month) |
| Trips by center | GET | /reports/trips/by-center | startDate, endDate, centerId, vehicleId |
| Trips completion rate | GET | /reports/trips/completion-rate | startDate, endDate, centerId, vehicleId |
| Queues summary | GET | /reports/queues/summary | startDate, endDate, centerId |
| Queues by center | GET | /reports/queues/by-center | startDate, endDate, centerId |
| Queues by date | GET | /reports/queues/by-date | startDate, endDate, centerId |
| Vehicles list | GET | /vehicles | page, limit, status (enum), search, searchBy, sortBy, include |
| Vehicles by status | GET | /vehicles/by-status/:status | status: AVAILABLE, IN_TRANSIT, WAITING_IN_QUEUE, LOADING, UNLOADING, IN_GARAGE |
| Vehicles by center | GET | /vehicles/by-center/:centerId | — |
| Vehicle detail | GET | /vehicles/:id | include |
| Update assignment | PUT | /vehicles/:id/assignment | body: { centerId } or { centerId: null } |
| Bulk assign to centers | PUT | /vehicles/assignments/bulk | body: { assignments: [ { vehicleId, centerId } ] } |
| Center queue | GET | /centers/:centerId/queue | type, isActive, date |
| Queue summary | GET | /centers/:centerId/queue/summary | — |
| Start next service | POST | /centers/:centerId/queue/next | body: { queueType: "LOADING"|"UNLOADING" } |
```

---

When the API changes, update the blocks above in this doc and re-copy into your dashboard.

---

## Key Dashboard Views

### 1. Overview Dashboard

**Purpose**: High-level operational metrics and status overview

**Endpoints Used** (see [Dashboard API Endpoints Reference](#dashboard-api-endpoints-reference) for full list):
- `GET /api/v1/reports/dashboard` - Summary metrics (vehicles by status, trips, queues, centers)
- `GET /api/v1/vehicles/status-summary` - Vehicle counts by status (AVAILABLE, IN_TRANSIT, WAITING_IN_QUEUE, LOADING, UNLOADING, IN_GARAGE)
- `GET /api/v1/trips?status=ONGOING&limit=10` - Recent active trips
- `GET /api/v1/centers` - List all centers
- `GET /api/v1/reports/trips/summary` - Trips stats (ongoing, completed, completion rate)

**Example Implementation**:

```javascript
// Fetch dashboard summary
async function loadDashboardSummary(accountId) {
  const [summary, vehicleStatus, activeTrips, centers] = await Promise.all([
    apiClient.get('/reports/dashboard'),
    apiClient.get('/vehicles/status-summary'),
    apiClient.get('/trips', { params: { status: 'ONGOING', limit: 10 } }),
    apiClient.get('/centers')
  ]);

  return {
    summary: summary.data,
    vehicleStatus: vehicleStatus.data,
    activeTrips: activeTrips.data.data,
    centers: centers.data.data
  };
}
```

**Display Components**:
- Total vehicles by status (cards) — use `GET /api/v1/vehicles/status-summary`
- Active trips count — use `GET /api/v1/reports/trips/summary` or `GET /api/v1/trips?status=ONGOING&limit=10`
- Queue summary — use `GET /api/v1/reports/queues/summary` or `GET /api/v1/reports/dashboard`
- Recent activity feed
- Center status map/list

---

### 2. Trips View

**Purpose**: View and filter all trips (ongoing and completed). Trips are **phase-based**; use `phase` and `status` from the API to drive the UI.

**Endpoints Used** (see [Dashboard API Endpoints Reference](#dashboard-api-endpoints-reference)):
- `GET /api/v1/trips` - List trips with filtering and pagination
- `GET /api/v1/trips/:id?include=vehicle,originCenter,destinationCenter,events` - Trip details (includes `phase` and event timeline)

**Filtering Options**:
- `status`: ONGOING | COMPLETED
- `phase`: Trip phase (e.g. AT_ORIGIN_ARRIVED, IN_TRANSIT, COMPLETED)
- `vehicleId`, `originCenterId`, `destinationCenterId`, `centerId` (origin or destination)
- `purpose`: DELIVERY | PICKUP
- `page`, `limit`: Pagination
- `sortBy`, `sortOrder`: Sorting
- `search`: Vehicle plate, center names
- `createdAt`: YYYY-MM-DD (trip creation date)
- `include`: vehicle, originCenter, destinationCenter, events

**Example Implementation**:

```javascript
// Load trips with filters
async function loadTrips(filters = {}) {
  const params = {
    page: filters.page || 1,
    limit: filters.limit || 20,
    include: 'vehicle,originCenter,destinationCenter',
    ...filters
  };

  const response = await apiClient.get('/trips', { params });
  return response.data;
}

// Load trip details with full event history
async function loadTripDetails(tripId) {
  const response = await apiClient.get(`/trips/${tripId}`, {
    params: { include: 'vehicle,originCenter,destinationCenter,events' }
  });
  return response.data;
}
```

**Display Components**:
- Trips table with columns:
  - Vehicle (plate number)
  - Origin Center
  - Destination Center
  - Phase / Status
  - Started At
  - Duration
  - Actions (View Details)
- Filters sidebar (status, phase, center, purpose, date)
- Pagination controls
- Trip timeline view (when viewing details) — events from `GET /api/v1/trips/:id?include=events`

---

### 3. Stats & Reports (Dashboard metrics)

**Purpose**: Power dashboard KPIs, charts, and analytics. All under **`/api/v1/reports`**.  
**Full reference**: See [Dashboard Reporting & Stats (reference for implementation)](#dashboard-reporting--stats-reference-for-implementation) for endpoint table and filter options.

**Endpoints and filter options:**

| Endpoint | Filter options | Default |
|----------|----------------|--------|
| `GET /reports/dashboard` | `startDate`, `endDate`, `centerId`, `vehicleId`, `agentId`, `groupBy` | Trip metrics → **today** if no dates |
| `GET /reports/trips/summary` | `startDate`, `endDate`, `centerId`, `vehicleId` | **Today** if no dates |
| `GET /reports/trips/by-date` | `startDate`, `endDate`, `centerId`, `vehicleId`, `groupBy` (day \| week \| month) | **Today** if no dates |
| `GET /reports/trips/by-center` | `startDate`, `endDate`, `centerId`, `vehicleId` | **Today** if no dates |
| `GET /reports/trips/by-origin-destination` | `startDate`, `endDate`, `centerId`, `vehicleId` | **Today** if no dates |
| `GET /reports/trips/completion-rate` | `startDate`, `endDate`, `centerId`, `vehicleId` | **Today** if no dates |
| `GET /reports/queues/summary` | `startDate`, `endDate`, `centerId` | Today |
| `GET /reports/queues/by-center` | `startDate`, `endDate`, `centerId` | Today |
| `GET /reports/queues/by-date` | `startDate`, `endDate`, `centerId` | Last 7 days |

**Display**: Summary cards, time-series charts, center/OD tables. Use the filter options above; omit dates to get current-day (trip reports) or default ranges (queue reports).

---

### 4. Queue Management View

**Purpose**: Monitor and manage queues at centers

**Endpoints Used**:
- `GET /api/v1/centers/:centerId/queue` - Get queue for a center
- `GET /api/v1/centers/:centerId/queue/summary` - Queue statistics
- `POST /api/v1/centers/:centerId/queue/next` - Start service for next vehicle

**Filtering Options**:
- `type`: LOADING | UNLOADING
- `isActive`: true | false (default: true)
- `date`: YYYY-MM-DD (default: today)

**Example Implementation**:

```javascript
// Load queue for a center
async function loadCenterQueue(centerId, filters = {}) {
  const params = {
    type: filters.type,
    isActive: filters.isActive !== undefined ? filters.isActive : true,
    date: filters.date || new Date().toISOString().split('T')[0]
  };

  const response = await apiClient.get(`/centers/${centerId}/queue`, { params });
  return response.data;
}

// Get queue summary
async function loadQueueSummary(centerId) {
  const response = await apiClient.get(`/centers/${centerId}/queue/summary`);
  return response.data;
}

// Start service for next vehicle
async function startNextService(centerId, queueType) {
  const response = await apiClient.post(`/centers/${centerId}/queue/next`, {
    queueType
  });
  return response.data;
}
```

**Display Components**:
- Queue list showing:
  - Position (with daily reset indicator)
  - Vehicle info
  - Queue type (LOADING/UNLOADING)
  - Wait time
  - Queued at timestamp
- Queue type tabs (Loading/Unloading)
- "Start Next Service" button
- Queue statistics cards

---

### 5. Vehicles View

**Purpose**: Track vehicle status and location, display **vehicles availability by status**, manage center assignments (single and **bulk**).

**Endpoints Used** (see [Dashboard API Endpoints Reference](#dashboard-api-endpoints-reference)):
- `GET /api/v1/vehicles` - List vehicles with pagination, search, sort
- `GET /api/v1/vehicles/status-summary` - **Vehicle availability by status** (counts per status: AVAILABLE, IN_TRANSIT, WAITING_IN_QUEUE, LOADING, UNLOADING, IN_GARAGE)
- `GET /api/v1/vehicles/by-status/:status` - **List vehicles for a given status** (e.g. all AVAILABLE or all IN_TRANSIT)
- `GET /api/v1/vehicles/by-center/:centerId` - Vehicles currently at a center
- `GET /api/v1/vehicles/:id` - Vehicle details
- `PUT /api/v1/vehicles/:id/assignment` - Update single vehicle center assignment
- `PUT /api/v1/vehicles/assignments/bulk` - **Bulk assign vehicles to centers** (body: `{ assignments: [ { vehicleId, centerId } ] }`; `centerId` can be `null` to clear)
- `PUT /api/v1/vehicles/:id/status` - Update vehicle status and location (use sparingly; status is usually derived from trips)

**Filtering Options**:
- `search`: Search by plate number, name
- `searchBy`: Fields to search in
- `page`, `limit`: Pagination
- `sortBy`: Sorting field
- `include`: Relations to load (trips, qrCodes, etc.)

**Example Implementation**:

```javascript
// Load vehicles with filters
async function loadVehicles(filters = {}) {
  const params = {
    page: filters.page || 1,
    limit: filters.limit || 50,
    search: filters.search,
    searchBy: filters.searchBy || 'plate,name',
    include: filters.include || 'trips',
    ...filters
  };

  const response = await apiClient.get('/vehicles', { params });
  return response.data;
}

// Load vehicles by status (for "availability by status" view)
async function loadVehiclesByStatus(status) {
  const response = await apiClient.get(`/vehicles/by-status/${status}`);
  return response.data;
}

// Load vehicle availability summary (counts per status)
async function loadVehiclesStatusSummary() {
  const response = await apiClient.get('/vehicles/status-summary');
  return response.data;
}

// Bulk assign vehicles to centers
async function bulkAssignVehiclesToCenters(assignments) {
  // assignments: [ { vehicleId: 17589, centerId: 3656 }, { vehicleId: 16982, centerId: null } ]
  const response = await apiClient.put('/vehicles/assignments/bulk', { assignments });
  return response.data; // { updatedCount, results: [ { vehicleId, centerId, success, error? } ] }
}

// Load vehicles at a center
async function loadVehiclesAtCenter(centerId) {
  const response = await apiClient.get(`/vehicles/by-center/${centerId}`);
  return response.data;
}

// Update vehicle center assignment
async function updateVehicleCenterAssignment(vehicleId, centerId) {
  const response = await apiClient.put(`/vehicles/${vehicleId}/assignment`, {
    centerId: centerId // Set to null to remove assignment
  });
  return response.data;
}

// Update vehicle status and location
async function updateVehicleStatus(vehicleId, status, centerId = null, notes = null) {
  const response = await apiClient.put(`/vehicles/${vehicleId}/status`, {
    status: status,
    centerId: centerId, // Required for WAITING_IN_QUEUE, LOADING, UNLOADING
    notes: notes
  });
  return response.data;
}
```

**Display Components**:
- **Vehicles availability by status**: Cards or table using `GET /api/v1/vehicles/status-summary`; drill-down per status with `GET /api/v1/vehicles/by-status/:status`.
- Vehicles table/grid with columns:
  - Plate number
  - Model/Brand
  - Current status
  - Current center (location)
  - Assigned center (assignment)
  - Actions (View Details, Update Center, Bulk Assign)
- Status filter chips — call `GET /api/v1/vehicles/by-status/AVAILABLE` etc.
- Center filter — `GET /api/v1/vehicles/by-center/:centerId`
- Search bar — `GET /api/v1/vehicles?search=...`
- **Bulk assign to centers**: Multi-select vehicles, choose center, call `PUT /api/v1/vehicles/assignments/bulk` with `assignments: [ { vehicleId, centerId } ]`; show per-item success/error from response.
- Vehicle detail modal with:
  - Full vehicle information
  - Current trip details
  - Update center assignment form
  - Update status form (optional)
- Status summary cards — `GET /api/v1/vehicles/status-summary`

**Update Center Assignment Flow**:

```javascript
// Example: Update vehicle center assignment
async function handleUpdateCenterAssignment(vehicleId, newCenterId) {
  try {
    showLoading('Updating center assignment...');
    
    // Update center assignment
    const updatedVehicle = await updateVehicleCenterAssignment(
      vehicleId, 
      newCenterId // or null to remove assignment
    );
    
    // Refresh vehicle list
    await refreshVehiclesList();
    
    showSuccess(`Vehicle assigned to center successfully`);
    
    // Update UI optimistically
    updateVehicleInList(updatedVehicle);
    
  } catch (error) {
    if (error.response?.status === 404) {
      showError('Vehicle or center not found');
    } else {
      showError('Failed to update center assignment');
    }
    handleApiError(error);
  } finally {
    hideLoading();
  }
}

// Example: Update vehicle status and location
async function handleUpdateVehicleStatus(vehicleId, status, centerId, notes) {
  try {
    showLoading('Updating vehicle status...');
    
    // Validate centerId for statuses that require location
    if ([VehicleStatus.WAITING_IN_QUEUE, VehicleStatus.LOADING, VehicleStatus.UNLOADING].includes(status)) {
      if (!centerId) {
        throw new Error('Center ID is required for this status');
      }
    }
    
    const updatedVehicle = await updateVehicleStatus(vehicleId, status, centerId, notes);
    
    // Refresh vehicle list
    await refreshVehiclesList();
    
    showSuccess(`Vehicle status updated to ${status}`);
    
    // Update UI optimistically
    updateVehicleInList(updatedVehicle);
    
  } catch (error) {
    if (error.response?.status === 400) {
      showError(error.response.data?.message || 'Invalid status or missing center ID');
    } else if (error.response?.status === 404) {
      showError('Vehicle or center not found');
    } else {
      showError('Failed to update vehicle status');
    }
    handleApiError(error);
  } finally {
    hideLoading();
  }
}
```

**UI Component Example**:

```javascript
// React component example
function VehicleCenterAssignmentModal({ vehicle, centers, onClose, onUpdate }) {
  const [selectedCenterId, setSelectedCenterId] = useState(vehicle.centerId || null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await updateVehicleCenterAssignment(vehicle.id, selectedCenterId);
      onUpdate(vehicle.id, selectedCenterId);
      onClose();
    } catch (error) {
      showError('Failed to update center assignment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h2>Update Center Assignment</h2>
      <p>Vehicle: {vehicle.plate}</p>
      
      <form onSubmit={handleSubmit}>
        <label>
          Assign to Center:
          <select 
            value={selectedCenterId || ''} 
            onChange={(e) => setSelectedCenterId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">None (Remove Assignment)</option>
            {centers.map(center => (
              <option key={center.id} value={center.id}>
                {center.name} ({center.geozoneId})
              </option>
            ))}
          </select>
        </label>
        
        <div>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={loading}>
            {loading ? 'Updating...' : 'Update Assignment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
```

---

### 6. Centers View

**Purpose**: Monitor center operations and vehicle counts

**Endpoints Used**:
- `GET /api/v1/centers` - List centers
- `GET /api/v1/centers/:id` - Center details
- `GET /api/v1/centers/:centerId/queue` - Center queue
- `GET /api/v1/centers/:centerId/queue/summary` - Queue summary
- `GET /api/v1/vehicles/by-center/:centerId` - Vehicles at center

**Example Implementation**:

```javascript
// Load centers
async function loadCenters() {
  const response = await apiClient.get('/centers');
  return response.data;
}

// Load center details with queue and vehicles
async function loadCenterDetails(centerId) {
  const [center, queue, vehicles, queueSummary] = await Promise.all([
    apiClient.get(`/centers/${centerId}`),
    apiClient.get(`/centers/${centerId}/queue`),
    apiClient.get(`/vehicles/by-center/${centerId}`),
    apiClient.get(`/centers/${centerId}/queue/summary`)
  ]);

  return {
    center: center.data,
    queue: queue.data,
    vehicles: vehicles.data,
    queueSummary: queueSummary.data
  };
}
```

**Display Components**:
- Centers list/map
- Center cards showing:
  - Name and location
  - Vehicle count
  - Queue counts (Loading/Unloading)
  - Active trips
- Center detail view with:
  - Queue management
  - Vehicle list
  - Recent activity

---

## Real-Time Monitoring

### Polling Strategy

For real-time updates, implement polling with exponential backoff:

```javascript
class DashboardPolling {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.intervals = new Map();
    this.baseInterval = 5000; // 5 seconds
  }

  // Start polling for a specific view
  startPolling(viewName, fetchFunction, callback) {
    // Clear existing interval if any
    this.stopPolling(viewName);

    let interval = this.baseInterval;
    let consecutiveErrors = 0;

    const poll = async () => {
      try {
        const data = await fetchFunction();
        callback(data);
        consecutiveErrors = 0;
        interval = this.baseInterval; // Reset to base interval on success
      } catch (error) {
        consecutiveErrors++;
        // Exponential backoff on errors
        interval = Math.min(this.baseInterval * Math.pow(2, consecutiveErrors), 60000);
        console.error(`Polling error for ${viewName}:`, error);
      }
    };

    // Initial fetch
    poll();

    // Set up interval
    const intervalId = setInterval(poll, interval);
    this.intervals.set(viewName, intervalId);
  }

  stopPolling(viewName) {
    const intervalId = this.intervals.get(viewName);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(viewName);
    }
  }

  stopAll() {
    this.intervals.forEach(intervalId => clearInterval(intervalId));
    this.intervals.clear();
  }
}

// Usage
const polling = new DashboardPolling(apiClient);

// Start polling for active trips
polling.startPolling('activeTrips', 
  () => apiClient.get('/trips', { params: { status: 'ONGOING' } }),
  (data) => {
    // Update UI with new data
    updateTripsView(data.data);
  }
);
```

### Smart Polling Intervals

Different views should have different polling intervals:

- **Overview Dashboard**: 10-15 seconds
- **Active Trips**: 5-10 seconds
- **Queue Management**: 3-5 seconds (most critical)
- **Vehicles List**: 15-30 seconds
- **Completed Trips**: 30-60 seconds (less critical)

### WebSocket Alternative (Future)

For even better real-time updates, consider WebSocket support:

```javascript
// Future WebSocket implementation
const ws = new WebSocket('wss://api.proofarrive.com/ws');

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  
  switch(update.type) {
    case 'TRIP_UPDATED':
      updateTripInUI(update.data);
      break;
    case 'QUEUE_UPDATED':
      updateQueueInUI(update.data);
      break;
    case 'VEHICLE_STATUS_CHANGED':
      updateVehicleStatus(update.data);
      break;
  }
};
```

---

## Data Refresh Strategies

### 1. Manual Refresh

```javascript
// Refresh button handler
function handleRefresh() {
  setIsLoading(true);
  loadDashboardData()
    .then(data => {
      updateState(data);
      showNotification('Data refreshed');
    })
    .catch(error => {
      showError('Failed to refresh data');
    })
    .finally(() => {
      setIsLoading(false);
    });
}
```

### 2. Auto-Refresh on Focus

```javascript
// Refresh when window regains focus
useEffect(() => {
  const handleFocus = () => {
    if (document.visibilityState === 'visible') {
      loadDashboardData();
    }
  };

  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleFocus);

  return () => {
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleFocus);
  };
}, []);
```

### 3. Stale Data Detection

```javascript
// Track data freshness
const dataCache = {
  trips: { data: null, timestamp: null },
  queues: { data: null, timestamp: null },
  vehicles: { data: null, timestamp: null }
};

const STALE_THRESHOLD = 30000; // 30 seconds

function isDataStale(key) {
  const cached = dataCache[key];
  if (!cached || !cached.timestamp) return true;
  
  const age = Date.now() - cached.timestamp;
  return age > STALE_THRESHOLD;
}

// Use cached data if fresh, otherwise fetch
async function getTrips(forceRefresh = false) {
  if (!forceRefresh && !isDataStale('trips')) {
    return dataCache.trips.data;
  }

  const data = await apiClient.get('/trips');
  dataCache.trips = { data, timestamp: Date.now() };
  return data;
}
```

---

## Filtering & Search Patterns

### 1. URL-Based Filters

Store filters in URL query parameters for shareable/bookmarkable views:

```javascript
// Read filters from URL
function getFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);
  return {
    status: params.get('status') || undefined,
    centerId: params.get('centerId') ? parseInt(params.get('centerId')) : undefined,
    vehicleId: params.get('vehicleId') ? parseInt(params.get('vehicleId')) : undefined,
    page: parseInt(params.get('page')) || 1,
    limit: parseInt(params.get('limit')) || 20
  };
}

// Update URL when filters change
function updateFilters(newFilters) {
  const params = new URLSearchParams();
  Object.entries(newFilters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value.toString());
    }
  });
  
  window.history.pushState({}, '', `?${params.toString()}`);
  loadData(newFilters);
}
```

### 2. Debounced Search

```javascript
import { debounce } from 'lodash';

// Debounce search input
const debouncedSearch = debounce((searchTerm) => {
  loadTrips({ search: searchTerm });
}, 500);

// Search input handler
function handleSearchChange(event) {
  const searchTerm = event.target.value;
  debouncedSearch(searchTerm);
}
```

### 3. Filter Persistence

```javascript
// Save filters to localStorage
function saveFilters(viewName, filters) {
  localStorage.setItem(`dashboard_filters_${viewName}`, JSON.stringify(filters));
}

// Load saved filters
function loadFilters(viewName) {
  const saved = localStorage.getItem(`dashboard_filters_${viewName}`);
  return saved ? JSON.parse(saved) : getDefaultFilters();
}
```

---

## Error Handling

### 1. API Error Handling

```javascript
// Centralized error handler
function handleApiError(error) {
  if (error.response) {
    // Server responded with error
    switch (error.response.status) {
      case 401:
        // Unauthorized - redirect to login
        redirectToLogin();
        break;
      case 403:
        showError('You do not have permission to perform this action');
        break;
      case 404:
        showError('Resource not found');
        break;
      case 429:
        showError('Too many requests. Please wait a moment.');
        break;
      case 500:
        showError('Server error. Please try again later.');
        break;
      default:
        showError(error.response.data?.message || 'An error occurred');
    }
  } else if (error.request) {
    // Request made but no response
    showError('Network error. Please check your connection.');
  } else {
    // Something else happened
    showError('An unexpected error occurred');
  }
}
```

### 2. Retry Logic

```javascript
// Retry failed requests
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiClient.get(url, options);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
}
```

### 3. Graceful Degradation

```javascript
// Show cached data if API fails
async function loadTripsWithFallback() {
  try {
    const data = await apiClient.get('/trips');
    return data.data;
  } catch (error) {
    console.error('Failed to load trips:', error);
    
    // Try to use cached data
    if (dataCache.trips?.data) {
      showWarning('Showing cached data. Some information may be outdated.');
      return dataCache.trips.data;
    }
    
    // No cached data available
    throw error;
  }
}
```

---

## Performance Optimization

### 1. Request Batching

```javascript
// Batch multiple requests
async function loadDashboardData() {
  const [summary, trips, vehicles] = await Promise.all([
    apiClient.get('/reports/dashboard'),
    apiClient.get('/trips', { params: { limit: 20 } }),
    apiClient.get('/vehicles', { params: { limit: 50 } })
  ]);

  return {
    summary: summary.data,
    trips: trips.data,
    vehicles: vehicles.data
  };
}
```

### 2. Pagination Best Practices

```javascript
// Load data in pages
async function loadTripsPage(page, limit = 20) {
  const response = await apiClient.get('/trips', {
    params: { page, limit }
  });

  return {
    data: response.data.data,
    meta: response.data.meta,
    links: response.data.links
  };
}

// Infinite scroll implementation
function useInfiniteTrips() {
  const [trips, setTrips] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const result = await loadTripsPage(page);
      setTrips(prev => [...prev, ...result.data]);
      setHasMore(result.meta.currentPage < result.meta.totalPages);
      setPage(prev => prev + 1);
    } catch (error) {
      handleApiError(error);
    } finally {
      setLoading(false);
    }
  };

  return { trips, loadMore, hasMore, loading };
}
```

### 3. Selective Relation Loading

```javascript
// Only load relations when needed
async function loadTrips(includeRelations = false) {
  const params = {
    limit: 20,
    include: includeRelations ? 'vehicle,originCenter,destinationCenter' : undefined
  };

  return apiClient.get('/trips', { params });
}

// Load relations on-demand (e.g., when expanding a row)
async function loadTripDetails(tripId) {
  return apiClient.get(`/trips/${tripId}`, {
    params: { include: 'vehicle,originCenter,destinationCenter,events' }
  });
}
```

### 4. Virtual Scrolling

For large lists, use virtual scrolling:

```javascript
// Use react-window or similar for virtual scrolling
import { FixedSizeList } from 'react-window';

function TripsList({ trips }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      <TripRow trip={trips[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={trips.length}
      itemSize={80}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

---

## Example Dashboard Flows

### Flow 1: Monitor Active Trips

```
1. User opens Dashboard
   ↓
2. Load Overview Summary
   GET /api/v1/reports/dashboard
   ↓
3. Display Active Trips Count
   ↓
4. User clicks "View All Trips"
   ↓
5. Load Trips List
   GET /api/v1/trips?status=ONGOING&include=vehicle,originCenter,destinationCenter
   ↓
6. Display Trips Table
   ↓
7. User clicks on a Trip
   ↓
8. Load Trip Details with Events
   GET /api/v1/trips/:id?include=vehicle,originCenter,destinationCenter,events
   ↓
9. Display Trip Timeline View
   ↓
10. Start Polling for Updates (every 5 seconds)
    GET /api/v1/trips/:id
```

### Flow 2: Manage Center Queue

```
1. User navigates to Centers View
   ↓
2. Load Centers List
   GET /api/v1/centers
   ↓
3. User selects a Center
   ↓
4. Load Center Queue & Summary
   GET /api/v1/centers/:centerId/queue
   GET /api/v1/centers/:centerId/queue/summary
   ↓
5. Display Queue Management View
   - Queue list (LOADING/UNLOADING tabs)
   - Position numbers
   - Wait times
   ↓
6. Start Polling Queue (every 3 seconds)
   GET /api/v1/centers/:centerId/queue?isActive=true
   ↓
7. User clicks "Start Next Service"
   ↓
8. Call Start Next Service API
   POST /api/v1/centers/:centerId/queue/next
   Body: { queueType: "LOADING" }
   ↓
9. Queue Automatically Updates
   - Position 1 vehicle removed
   - Remaining vehicles renumbered (1, 2, 3...)
   ↓
10. Refresh Queue Display
```

### Flow 3: Track Vehicle Journey

```
1. User searches for Vehicle
   GET /api/v1/vehicles?search=ABC123
   ↓
2. Display Vehicle List
   ↓
3. User clicks on Vehicle
   ↓
4. Load Vehicle Details with Trips
   GET /api/v1/vehicles/:id?include=trips
   ↓
5. Display Vehicle Info & Active Trip
   ↓
6. User clicks "View Trip Details"
   ↓
7. Load Trip with Full Event History
   GET /api/v1/trips/:id?include=vehicle,originCenter,destinationCenter,events
   ↓
8. Display Trip Timeline
   - ARRIVED event
   - QUEUED event
   - SERVICE_STARTED event
   - LOADING_ENDED event
   - EXITED event
   - ARRIVED_DESTINATION event
   ↓
9. Start Polling Trip Updates (every 5 seconds)
   GET /api/v1/trips/:id
```

### Flow 4: Filter and Search Trips

```
1. User opens Trips View
   ↓
2. Load Default Trips
   GET /api/v1/trips?page=1&limit=20
   ↓
3. User applies Filters
   - Status: ONGOING
   - Origin Center: Center A
   - Sort: startedAt DESC
   ↓
4. Update URL Query Parameters
   ?status=ONGOING&originCenterId=1&sortBy=startedAt&sortOrder=desc
   ↓
5. Load Filtered Trips
   GET /api/v1/trips?status=ONGOING&originCenterId=1&sortBy=startedAt&sortOrder=desc
   ↓
6. Display Filtered Results
   ↓
7. User types in Search Box
   ↓
8. Debounced Search (500ms delay)
   GET /api/v1/trips?search=ABC123&searchBy=plate
   ↓
9. Display Search Results
```

### Flow 5: Update Vehicle Center Assignment

```
1. User navigates to Vehicles View
   ↓
2. Load Vehicles List
   GET /api/v1/vehicles?page=1&limit=50
   ↓
3. User clicks on a Vehicle
   ↓
4. Load Vehicle Details
   GET /api/v1/vehicles/:id?include=trips
   ↓
5. Display Vehicle Information
   - Plate number
   - Current status
   - Current center (location)
   - Assigned center (assignment)
   ↓
6. User clicks "Update Center Assignment"
   ↓
7. Load Centers List (if not already loaded)
   GET /api/v1/centers
   ↓
8. Display Center Assignment Modal
   - Dropdown with available centers
   - Current assignment highlighted
   - Option to remove assignment (set to null)
   ↓
9. User selects new center (or "None")
   ↓
10. Call Update Assignment API
    PUT /api/v1/vehicles/:id/assignment
    Body: { centerId: 123 } // or null to remove
    ↓
11. Update Successful (200 OK)
    ↓
12. Refresh Vehicle List
    GET /api/v1/vehicles?page=1&limit=50
    ↓
13. Update UI Optimistically
    - Show updated vehicle in list
    - Close modal
    - Show success notification
```

### Flow 6: Update Vehicle Status and Location

```
1. User navigates to Vehicles View
   ↓
2. User clicks on a Vehicle
   ↓
3. Load Vehicle Details
   GET /api/v1/vehicles/:id
   ↓
4. User clicks "Update Status"
   ↓
5. Display Status Update Form
   - Status dropdown (AVAILABLE, IN_TRANSIT, WAITING_IN_QUEUE, LOADING, UNLOADING)
   - Center dropdown (required for WAITING_IN_QUEUE, LOADING, UNLOADING)
   - Notes field (optional)
   ↓
6. User selects Status: LOADING
   ↓
7. User selects Center (required for LOADING)
   ↓
8. User enters notes (optional)
   ↓
9. Call Update Status API
    PUT /api/v1/vehicles/:id/status
    Body: {
      status: "LOADING",
      centerId: 123,
      notes: "Vehicle loading timber"
    }
    ↓
10. Update Successful (200 OK)
    ↓
11. Refresh Vehicle List
    GET /api/v1/vehicles
    ↓
12. Update UI
    - Show updated status in list
    - Show updated center location
    - Show success notification
```

---

## Best Practices

### 1. Loading States

Always show loading indicators:

```javascript
function TripsView() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTrips()
      .then(data => {
        setTrips(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  return <TripsTable trips={trips} />;
}
```

### 2. Optimistic Updates

For actions that are likely to succeed:

```javascript
async function startNextService(centerId, queueType) {
  // Optimistically update UI
  const optimisticQueue = removeFirstFromQueue(currentQueue);
  setQueue(optimisticQueue);

  try {
    const result = await apiClient.post(`/centers/${centerId}/queue/next`, {
      queueType
    });
    // Update with actual server response
    setQueue(result.data.queue);
  } catch (error) {
    // Revert on error
    setQueue(currentQueue);
    handleApiError(error);
  }
}
```

### 3. Cache Management

```javascript
// Clear cache when data changes
function handleTripCreated(newTrip) {
  // Invalidate trips cache
  dataCache.trips = null;
  
  // Add new trip to list optimistically
  setTrips(prev => [newTrip, ...prev]);
  
  // Refresh from server
  loadTrips();
}
```

### 4. User Feedback

```javascript
// Show success/error notifications
function handleAction(action, params) {
  showLoading('Processing...');
  
  apiClient.post(`/trips/${params.tripId}/complete`)
    .then(() => {
      showSuccess('Trip completed successfully');
      refreshTrips();
    })
    .catch(error => {
      showError('Failed to complete trip');
      handleApiError(error);
    })
    .finally(() => {
      hideLoading();
    });
}
```

---

## Summary

This dashboard integration workflow provides:

✅ **Complete API Coverage**: Trips (phase-based), trip events, stats (`/reports/*`), vehicles (including availability by status), bulk vehicle assignment, queues, centers  
✅ **Dashboard API Endpoints Reference**: Single place for [Trips](#trips), [Trip events](#trip-events), [Stats](#stats-reports), [Vehicles availability](#vehicles--availability-by-status), [Bulk assign](#bulk-assign-vehicles-to-centers) with method and path for each  
✅ **Vehicle Management**: Single and bulk center assignment; vehicle availability by status  
✅ **Real-Time Updates**: Polling strategies for live data  
✅ **Performance Optimization**: Batching, pagination, caching  
✅ **Error Handling**: Robust error management and retry logic  
✅ **User Experience**: Loading states, optimistic updates, notifications  
✅ **Best Practices**: URL-based filters, debounced search, virtual scrolling  

### Key Vehicle Management Features

- **Vehicle availability by status**: Use `GET /api/v1/vehicles/status-summary` for counts and `GET /api/v1/vehicles/by-status/:status` to list vehicles per status (AVAILABLE, IN_TRANSIT, WAITING_IN_QUEUE, LOADING, UNLOADING, IN_GARAGE).
- **Bulk assign to centers**: Use `PUT /api/v1/vehicles/assignments/bulk` with `{ assignments: [ { vehicleId, centerId } ] }`; response includes per-item success/error.
- **Update Center Assignment**: Assign single vehicle to a center or remove assignment.
- **Update Vehicle Status**: Change vehicle status and location (currentCenterId).
- **View Vehicle Details**: See full vehicle information, trips, and history.
- **Filter by Center**: View all vehicles at a specific center (`GET /api/v1/vehicles/by-center/:centerId`).
- **Filter by Status**: View vehicles by operational status (`GET /api/v1/vehicles/by-status/:status`).

### Available Vehicle Update Endpoints

- `GET /api/v1/vehicles/status-summary` - Vehicle availability by status (counts)
- `GET /api/v1/vehicles/by-status/:status` - List vehicles by status
- `GET /api/v1/vehicles/by-center/:centerId` - List vehicles at a center
- `PUT /api/v1/vehicles/:id/assignment` - Update single vehicle center assignment (centerId)
- `PUT /api/v1/vehicles/assignments/bulk` - Bulk assign vehicles to centers (body: `{ assignments: [ { vehicleId, centerId } ] }`)
- `PUT /api/v1/vehicles/:id/status` - Update status and location (currentCenterId)

**Note**: 
- `centerId` (assignment) is separate from `currentCenterId` (location)
- Assignment tracks which center owns/manages the vehicle
- Current center tracks where the vehicle physically is right now

For mobile app integration, refer to [TRIPS_API_INTEGRATION_FLOW.md](./TRIPS_API_INTEGRATION_FLOW.md).
