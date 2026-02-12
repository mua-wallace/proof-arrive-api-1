# Dashboard Integration Workflow

This document describes how to integrate a web dashboard with the Proof Arrive API to monitor vehicle movements, manage queues, track trips, and view real-time operational data.

## Table of Contents
1. [Overview](#overview)
2. [Dashboard Architecture](#dashboard-architecture)
3. [Authentication & Setup](#authentication--setup) *(Reference - Already Implemented)*
4. [Key Dashboard Views](#key-dashboard-views)
5. [Real-Time Monitoring](#real-time-monitoring)
6. [Data Refresh Strategies](#data-refresh-strategies)
7. [Filtering & Search Patterns](#filtering--search-patterns)
8. [Error Handling](#error-handling)
9. [Performance Optimization](#performance-optimization)
10. [Example Dashboard Flows](#example-dashboard-flows)

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

## Key Dashboard Views

### 1. Overview Dashboard

**Purpose**: High-level operational metrics and status overview

**Endpoints Used**:
- `GET /api/v1/reports/dashboard` - Summary metrics
- `GET /api/v1/vehicles/status-summary` - Vehicle status breakdown
- `GET /api/v1/trips?status=ONGOING&limit=10` - Recent active trips
- `GET /api/v1/centers` - List all centers

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
- Total vehicles by status (cards)
- Active trips count
- Queue summary (total waiting)
- Recent activity feed
- Center status map/list

---

### 2. Trips View

**Purpose**: View and filter all trips (ongoing and completed)

**Endpoints Used**:
- `GET /api/v1/trips` - List trips with filtering
- `GET /api/v1/trips/:id?include=vehicle,originCenter,destinationCenter,events` - Trip details

**Filtering Options**:
- `status`: ONGOING | COMPLETED
- `vehicleId`: Filter by specific vehicle
- `originCenterId`: Filter by origin center
- `destinationCenterId`: Filter by destination center
- `purpose`: DELIVERY | PICKUP
- `page`, `limit`: Pagination
- `sortBy`, `sortOrder`: Sorting

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
  - Status
  - Started At
  - Duration
  - Actions (View Details)
- Filters sidebar
- Pagination controls
- Trip timeline view (when viewing details)

---

### 3. Queue Management View

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

### 4. Vehicles View

**Purpose**: Track vehicle status and location

**Endpoints Used**:
- `GET /api/v1/vehicles` - List vehicles
- `GET /api/v1/vehicles/:id` - Vehicle details
- `GET /api/v1/vehicles/by-status/:status` - Vehicles by status
- `GET /api/v1/vehicles/by-center/:centerId` - Vehicles at center
- `GET /api/v1/vehicles/status-summary` - Status breakdown

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

// Load vehicles by status
async function loadVehiclesByStatus(status) {
  const response = await apiClient.get(`/vehicles/by-status/${status}`);
  return response.data;
}

// Load vehicles at a center
async function loadVehiclesAtCenter(centerId) {
  const response = await apiClient.get(`/vehicles/by-center/${centerId}`);
  return response.data;
}
```

**Display Components**:
- Vehicles table/grid
- Status filter chips
- Center filter dropdown
- Search bar
- Vehicle detail modal
- Status summary cards

---

### 5. Centers View

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

✅ **Complete API Coverage**: All endpoints for trips, queues, vehicles, and centers  
✅ **Real-Time Updates**: Polling strategies for live data  
✅ **Performance Optimization**: Batching, pagination, caching  
✅ **Error Handling**: Robust error management and retry logic  
✅ **User Experience**: Loading states, optimistic updates, notifications  
✅ **Best Practices**: URL-based filters, debounced search, virtual scrolling  

For mobile app integration, refer to [TRIPS_API_INTEGRATION_FLOW.md](./TRIPS_API_INTEGRATION_FLOW.md).
