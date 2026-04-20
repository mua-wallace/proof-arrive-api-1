# Proof Arrive API

A comprehensive NestJS-based REST API for tracking and managing vehicle logistics operations via trips and an immutable trip-event timeline. The system integrates with the Malambi third-party API to synchronize user, vehicle, and center data. Built with TypeScript, Drizzle ORM, and PostgreSQL.

## 🚀 Features

- **RESTful API** with NestJS framework
- **JWT Authentication** with access and refresh tokens
- **Trips** covering end-to-end vehicle journeys between centers
- **Trip Events** forming an immutable audit timeline (arrivals, queueing, service start/end, exits)
- **Queues** for loading/unloading per center
- **Exceptions** for reporting and resolving issues encountered during trips
- **Data Synchronization** with Malambi API via background jobs
- **Audit Trail** with `createdBy` fields to track user actions
- **PostgreSQL Database** with Drizzle ORM
- **Docker Support** for easy deployment
- **Swagger Documentation** for API exploration
- **TypeScript** for type safety
- **Environment-based Configuration** with Joi validation
- **Error Handling** with Sentry integration
- **CORS** support for cross-origin requests
- **Validation** with class-validator
- **Base Service** for common CRUD operations
- **Pagination, Filtering, and Sorting** on all list endpoints

## 📁 Project Structure

```text
src/
├── main.ts                 # Application entry point
├── app.module.ts          # Root module
├── config/                # Configuration files
│   └── app.config.ts      # Application configuration
├── database/              # Database configuration
│   ├── database.module.ts
│   ├── database-connection.ts
│   ├── drizzle.config.ts
│   └── migrations/        # Database migrations
├── modules/               # Feature modules
│   ├── vehicles/         # Vehicle management
│   ├── trips/           # Trips and trip events
│   ├── queues/          # Loading/unloading queues
│   ├── exceptions/      # Trip exceptions
│   ├── centers/         # Center management
│   ├── users/           # User management
│   ├── reports/         # Reporting
│   └── schemas/         # Database schemas
├── common/               # Shared utilities
│   ├── filters/         # Exception filters
│   ├── guards/          # Authentication guards
│   ├── interceptors/     # Request/response interceptors
│   ├── decorators/      # Custom decorators
│   ├── interfaces/      # TypeScript interfaces
│   └── services/        # Base services
└── integrations/        # Third-party integrations
    └── third-party/     # External service integrations
```

## 🛠️ Tech Stack

- **Framework**: NestJS 11
- **Language**: TypeScript
- **Database**: PostgreSQL 16
- **ORM**: Drizzle ORM
- **Validation**: Joi, class-validator
- **Documentation**: Swagger/OpenAPI
- **Error Tracking**: Sentry
- **Containerization**: Docker & Docker Compose

## 📋 Prerequisites

- Node.js 22.17.0 or higher
- Docker and Docker Compose
- npm or yarn

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd proof-arrive-api
```

### 2. Environment Setup

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration values.

### 3. Run with Docker Compose (Recommended)

The easiest way to run the application is using Docker Compose:

```bash
# Build and start all services
docker-compose up --build

# Run in detached mode
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

The application will be available at:

- **API**: <http://localhost:5001>
- **Swagger Documentation**: <http://localhost:5001/docs>
- **PostgreSQL**: localhost:5432

### 4. Run Locally (Development)

If you prefer to run without Docker:

```bash
# Install dependencies
npm install

# Start PostgreSQL (if not using Docker)
docker-compose up -d postgres

# Run database migrations
npm run db:migrate  # If you have migration scripts

# Start the application in development mode
npm run start:dev
```

The application will be available at:

- **API**: <http://localhost:5000>
- **Swagger Documentation**: <http://localhost:5000/docs>

## 📝 Environment Variables

See `.env.example` for all available environment variables. Key variables include:

### Application

- `PORT` - Server port (default: 5000)
- `API_PREFIX` - API route prefix (default: api/v1)
- `APP_MODE` - Application mode: development | production
- `APP_NAME` - Application name (default: Proof Arrive API)
- `APP_DOCS` - Swagger documentation path (default: docs)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins

### Database

- `DATABASE_HOST` - Database host (default: localhost)
- `DATABASE_PORT` - Database port (default: 5432)
- `DATABASE_USERNAME` - Database username (default: postgres)
- `DATABASE_PASSWORD` - Database password (default: postgres)
- `DATABASE_NAME` - Database name (default: proof_arrive)
- `DATABASE_LOGGING` - Enable database query logging (true/false)

### JWT Authentication

- `JWT_ACCESS_TOKEN_SECRET` - Secret key for signing access tokens
- `JWT_ACCESS_TOKEN_EXPIRATION` - Access token expiration in milliseconds (default: 3600000 = 1 hour)
- `JWT_REFRESH_TOKEN_SECRET` - Secret key for signing refresh tokens
- `JWT_REFRESH_TOKEN_EXPIRATION` - Refresh token expiration in milliseconds (default: 259200000 = 3 days)
- `JWT_REFRESH_TOKEN_EXPIRATION_DAYS` - Refresh token expiration in days (default: 3)

### Malambi Integration

- `MALAMBI_API_BASE_URL` - Base URL for Malambi API (default: https://malambi.net/Helper)
- `MALAMBI_API_BASE_URL_GEOZONE` - Base URL for Malambi Geozone API (default: https://fm7.malambi.net/Helper)

## 🗄️ Database

### Automatic Schema Synchronization

**The application automatically syncs the database schema on every container startup!**

When the container starts, the `scripts/start-with-migrations.sh` script automatically:
1. Checks for database connection
2. Runs all SQL migrations in order (with retry logic)
3. **Automatically verifies critical user migrations** (0005, 0011, 0015) are applied
4. **Automatically re-runs user migrations if they're missing** (ensures user table schema is correct)
5. Verifies other critical migrations (account_id, qr_code columns, etc.)
6. Starts the NestJS application

**You don't need to manually run migrations in production** - the schema is automatically kept in sync with your code.

**User Migrations (Automatically Verified):**
- `0005_add_user_fields.sql` - Adds email, role, fullname columns
- `0011_add_unique_constraint_users_accid_subid.sql` - Creates unique constraint
- `0015_use_subid_as_user_id.sql` - Changes id from UUID to integer (equals subid)

### Manual Migrations (Development)

If you need to manually sync the schema:

```bash
# Inside Docker container
sh scripts/run-migrations.sh

# Or use the helper script
sh scripts/drizzle.sh push

# Or use npm scripts
npm run db:push
```

Generate migration files (if needed):

```bash
npm run db:generate
```

### Database Schema

Database schemas are defined in `src/modules/schemas/`. The base schemas include:

**Base Columns (UUID-based tables like users):**
- `id` (UUID, primary key)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)
- `deletedAt` (timestamp, nullable for soft deletes)

**Base Columns Serial (Integer-based tables like trips, trip_events, etc.):**
- `id` (serial integer, primary key)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

**Key Tables:**
- `users` - User/agent information (synced from Malambi)
- `vehicles` - Vehicle information (synced from Malambi)
- `centers` - Center/location information (synced from Malambi)
- `trips` - End-to-end vehicle journeys between centers
- `trip_events` - Immutable timeline of events on each trip (arrivals, queueing, service, exits)
- `center_queues` - Loading/unloading queue state per center
- `trip_exceptions` - Exceptions reported during trips

**Relations:**
- All tables support relational queries via Drizzle ORM
- Foreign key relationships between vehicles, centers, users, trips, and trip events
- `createdBy` fields on relevant records for audit trail

## 📚 API Documentation

Once the application is running, access the Swagger documentation at:

- **Local**: <http://localhost:5000/docs>
- **Docker**: <http://localhost:5001/docs>

The Swagger UI provides:

- **Comprehensive API Description**: Overview, authentication, workflows, and common operations
- **Interactive API Exploration**: Test endpoints directly from the browser
- **Request/Response Schemas**: Full DTO definitions with validation rules
- **Authentication Testing**: Built-in JWT token management
- **Dark Theme Interface**: Modern, developer-friendly UI
- **Tag-based Organization**: Endpoints grouped by feature modules

### API Overview

The Swagger documentation includes detailed information about:

- **Overview**: What the API does and its purpose
- **Key Features**: Core functionality and capabilities
- **Authentication**: JWT token flow and usage
- **Data Synchronization**: Malambi integration details
- **Common Operations**: Trip workflow examples
- **Pagination & Filtering**: Query parameter usage
- **Error Handling**: HTTP status codes and error responses

## 🏗️ Available Modules

### Authentication (`/api/v1/auth`)

- **Login**: Authenticate with Malambi credentials to receive JWT tokens
- **Refresh Token**: Obtain new access tokens using refresh tokens
- **Check**: Verify authentication status
- **Auto-sync**: User data automatically synced on login via background jobs

### Users (`/api/v1/users`)

- **List Users**: Paginated list with filtering, searching, and sorting
- **Get User Details**: Retrieve user information by ID or current user (`/me`)
- **Delete User**: Remove user by internal ID
- **Data Source**: Synced from Malambi API on login

### Centers (`/api/v1/centers`)

- **List Centers**: Paginated list with filtering and relations
- **Get Center Details**: Retrieve center information by ID
- **Sync Center**: Find and sync center from Malambi by geozone ID - **Returns center data immediately**
  - If center exists in database: Returns the database record
  - If center found in API: Returns API data and triggers background sync job
  - Response includes: `found`, `synced`, `skipped`, `message`, and `center` (center data object)
- **Get Centers from API**: Fetch all centers from Malambi API without saving
- **Delete Center**: Remove center by internal ID
- **Data Source**: Synced from Malambi API on-demand

### Vehicles (`/api/v1/vehicles`)

- **List Vehicles**: Paginated list with filtering and relations
- **Get Vehicle Details**: Retrieve vehicle information by ID
- **Sync Vehicle**: Trigger background job to sync vehicle from Malambi by vehicle ID
- **Get Vehicle from API**: Fetch vehicle details from Malambi API without saving
- **Delete Vehicle**: Remove vehicle by internal ID
- **Data Source**: Synced from Malambi API on-demand

### Trips (`/api/v1/trips`)

- **Create Trip**: Start a trip for a vehicle leaving an origin center
- **List Trips**: Paginated list with filtering by status, purpose, phase, and date range
- **Get Trip Details**: Retrieve trip information with events timeline
- **Create Trip Event**: Append an event to a trip (ARRIVED, QUEUED, SERVICE_STARTED, LOADING_ENDED, UNLOADING_ENDED, READY_TO_EXIT, EXITED, etc.)
- **Set Destination / End Unloading / Complete**: State-transition endpoints for the trip lifecycle
- **Features**: Immutable event timeline, automatic vehicle status and `currentCenterId` updates

### Queues (`/api/v1/queues`)

- **Add to Queue**: Add a vehicle to a center's loading or unloading queue
- **List Queues**: Paginated, filterable by center, queue type, and activity state
- **Remove / Reorder**: Manage queue entries

### Exceptions (`/api/v1/exceptions`)

- **Report Exception**: Record an issue encountered during a trip
- **Resolve / Close Exception**: Update status and outcome
- **List Exceptions**: Filter by status, type, trip, or center

### Reports (`/api/v1/reports`)

Generate and manage reports (coming soon).

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov

# Watch mode
npm run test:watch
```

## 🛠️ Development

### Available Scripts

```bash
# Development
npm run start:dev      # Start in watch mode
npm run start:debug     # Start in debug mode

# Production
npm run build           # Build the application
npm run start:prod     # Start in production mode

# Code Quality
npm run lint            # Run ESLint
npm run format          # Format code with Prettier
```

### Code Structure

- **Modules**: Feature-based modules in `src/modules/`
  - Each module contains: controller, service, DTOs, and optional sync service
- **Services**: Business logic in `*.service.ts` files
  - Extend `BaseService` for common CRUD operations
  - Handle error wrapping and logging
- **Controllers**: API endpoints in `*.controller.ts` files
  - Use `@CurrentUserCredentials()` decorator for authenticated user info
  - Swagger documentation with `@ApiTags` and `@ApiOperation`
- **DTOs**: Data transfer objects in `dto/` folders
  - Validation with `class-validator`
  - Swagger documentation with `@ApiProperty`
- **Schemas**: Database schemas in `src/modules/schemas/`
  - Drizzle ORM table definitions
  - Relations defined in `relations.ts`
- **Base Service**: Reusable CRUD operations in `src/common/services/base.service.ts`
- **Background Jobs**: Queue-based processing in `src/common/queue/`
  - Async data synchronization with Malambi API
- **Integrations**: Third-party API clients in `src/integrations/`
  - Malambi API service for external data fetching

## 🐳 Docker

### Build Image

```bash
docker build -t proof-arrive-api .
```

### Run Container

```bash
docker run -p 5001:5000 proof-arrive-api
```

### Docker Compose Services

- **proof-arrive-api**: The NestJS application
- **postgres**: PostgreSQL 16 database

## 🔒 Security & Authentication

### JWT Authentication

The API uses JWT (JSON Web Token) authentication:

- **Access Tokens**: Short-lived tokens (default: 1 hour) for API requests
- **Refresh Tokens**: Long-lived tokens (default: 3 days) for obtaining new access tokens
- **Token Format**: `Authorization: Bearer <token>`
- **Public Endpoints**: Only `/auth/login`, `/auth/refresh-token`, and `/auth/check` are publicly accessible
- **Global Guard**: All other endpoints require a valid JWT token

### Security Features

- Environment variables for sensitive data
- CORS configuration for allowed origins
- Input validation with class-validator
- Error tracking with Sentry (production)
- SQL injection protection via Drizzle ORM
- Audit trail with `createdBy` fields on all records
- Background job processing for data synchronization

## 📦 Dependencies

### Core

- `@nestjs/common`, `@nestjs/core` - NestJS framework
- `drizzle-orm` - TypeScript ORM
- `postgres` - PostgreSQL client
- `@nestjs/config` - Configuration management
- `joi` - Environment variable validation

### Documentation

- `@nestjs/swagger` - API documentation
- `swagger-themes` - Swagger UI themes

### Utilities

- `cookie-parser` - Cookie parsing middleware
- `@sentry/node` - Error tracking

## 🤝 Contributing

1. Create a feature branch

2. Make your changes
3. Run tests and linting
4. Submit a pull request

## 📄 License

This project is private and proprietary.

## 🔄 Data Synchronization

The API integrates with the **Malambi** third-party system to keep data synchronized:

### Enhanced Integration Features

The API provides **immediate data access** during sync operations:

- **Center Sync with Data Return**: When syncing a center by geozone ID, the endpoint returns the center data immediately
  - No need for a separate API call to fetch center details after syncing
  - Works seamlessly whether the center exists in the database or needs to be fetched from the Malambi API
  - Background sync job runs asynchronously while you can use the returned data immediately

### Automatic Sync

- **Users**: Automatically synced on login via background jobs if not already present in local database
- **Last Login Tracking**: User's `lastLoginAt` is updated on each login

### On-Demand Sync

- **Vehicles**: Sync by vehicle ID via `POST /api/v1/vehicles/sync?vehicle_id=xxx`
- **Centers**: Sync by geozone ID via `POST /api/v1/centers/sync?geozone_id=xxx`
  - **Enhanced Response**: The endpoint now returns center data immediately in the response
  - If center already exists in database: Returns the existing center record
  - If center found in Malambi API: Returns the API center data and triggers background sync job
  - This eliminates the need for a separate API call to fetch center data after syncing
  - Response format:
    ```json
    {
      "found": true,
      "synced": true,
      "skipped": false,
      "message": "Center with gzone_id=3656 (Center Name) sync job triggered",
      "center": {
        "id": 84,
        "siteid": 9164,
        "name": "Center Name",
        "gzone_id": 3656,
        ...
      }
    }
    ```

### Background Jobs

All sync operations run asynchronously in the background using a queue system:
- Jobs are processed by `QueueProcessorService`
- Prevents blocking API responses
- Automatic retry on failures
- Job status tracking

### Fetch Without Saving

- **Vehicles**: `GET /api/v1/vehicles/from-api?vehicle_id=xxx` - Fetch vehicle details without saving
- **Centers**: `GET /api/v1/centers/from-api` - Fetch all centers from Malambi API without saving

## 📊 Common Workflows

### Trip Workflow

1. **Create Trip**: `POST /api/v1/trips`
   - Vehicle starts a trip from an origin center
   - Purpose specified (e.g., DELIVERY, PICKUP)
   - Trip status set to ONGOING

2. **Record Events**: `POST /api/v1/trips/:id/events`
   - Append events as the vehicle moves: ARRIVED, QUEUED, SERVICE_STARTED, LOADING_ENDED, UNLOADING_ENDED, READY_TO_EXIT, EXITED, ARRIVED_DESTINATION
   - Vehicle `status` and `currentCenterId` are updated automatically based on event type

3. **Set Destination** (when ready to leave): `POST /api/v1/trips/:id/set-destination`
   - Attach the destination center to the trip

4. **Complete the Trip**: `POST /api/v1/trips/:id/end-unloading` (for DELIVERY)
   - Finalizes the trip when unloading completes at the destination

## 🔍 Query Parameters

Most list endpoints support the following query parameters:

### Pagination

- `page` - Page number (default: 1)
- `limit` - Items per page (default: 100, max: 1000)

### Search & Filter

- `search` - Search term to match against specified fields
- `searchBy` - Comma-separated list of fields to search in (e.g., `searchBy=name,plate`)
- `sortBy` - Comma-separated sort fields (format: `field:direction`, e.g., `sortBy=createdAt:DESC,id:ASC`)

### Relations

- `include` - Comma-separated list of relations to load (e.g., `include=vehicle,center,agent`)

### Example

```
GET /api/v1/trips?page=1&limit=50&sortBy=startedAt:DESC&include=events,vehicle,originCenter,destinationCenter
```

## 🆘 Support

For issues and questions, please contact the development team.
