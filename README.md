# Proof Arrive API

A comprehensive NestJS-based REST API for tracking and managing vehicle logistics operations, including arrivals, exits, and inter-center transfers. The system integrates with the Malambi third-party API to synchronize user, vehicle, and center data. Built with TypeScript, Drizzle ORM, and PostgreSQL.

## 🚀 Features

- **RESTful API** with NestJS framework
- **JWT Authentication** with access and refresh tokens
- **Vehicle Arrival Tracking** with QR code scanning, GPS coordinates, and processing stages
- **Exit Management** with destination tracking and exit types
- **Incoming Vehicle Operations** for managing vehicles in transit between centers
- **Processing Stages** for multi-stage workflow tracking (unloading, inspection, etc.)
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
│   ├── arrivals/         # Arrival tracking
│   ├── exits/           # Exit tracking
│   ├── incoming/        # Incoming operations
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

**Base Columns Serial (Integer-based tables like arrivals, exits, etc.):**
- `id` (serial integer, primary key)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

**Key Tables:**
- `users` - User/agent information (synced from Malambi)
- `vehicles` - Vehicle information (synced from Malambi)
- `centers` - Center/location information (synced from Malambi)
- `arrivals` - Vehicle arrival records with QR codes and processing stages
- `exits` - Vehicle exit records with destination information
- `incoming_vehicles` - Vehicles in transit between centers
- `processing_stages` - Multi-stage processing workflows for arrivals

**Relations:**
- All tables support relational queries via Drizzle ORM
- Foreign key relationships between vehicles, centers, users, arrivals, exits, and incoming vehicles
- `createdBy` fields on arrivals, exits, and incoming_vehicles for audit trail

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
- **Common Operations**: Workflow examples for arrivals and exits
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

### Arrivals (`/api/v1/arrivals`)

- **Create Arrival**: Record vehicle arrival at a center (scan QR code)
- **List Arrivals**: Paginated list with filtering, searching, and sorting
- **Get Arrival Details**: Retrieve arrival information with optional relations
- **Update Status**: Update arrival status
- **Start Processing Stage**: Create a new processing stage for an arrival
- **Update Processing Stage**: Update processing stage status and notes
- **Features**: QR code tracking, GPS coordinates, multi-stage processing workflows

### Exits (`/api/v1/exits`)

- **Create Exit**: Record vehicle exit from a center
- **List Exits**: Paginated list with filtering and relations
- **Get Exit Details**: Retrieve exit information with optional relations
- **Update Exit**: Update exit information (destination, notes, etc.)
- **Delete Exit**: Remove exit by internal ID
- **Features**: Exit type tracking, destination center/name, GPS coordinates

### Incoming Vehicles (`/api/v1/incoming`)

- **Create Incoming Vehicle**: Record vehicle in transit between centers
- **List Incoming Vehicles**: Paginated list with filtering and relations
- **Get Incoming Vehicle Details**: Retrieve incoming vehicle information
- **Update Incoming Vehicle**: Update status, estimated/actual arrival, distance
- **Delete Incoming Vehicle**: Remove incoming vehicle by internal ID
- **Features**: Status tracking, arrival estimates, distance calculation

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

### Arrival Workflow

1. **Create Arrival**: `POST /api/v1/arrivals`
   - Vehicle arrives at center
   - QR code scanned (optional)
   - GPS coordinates recorded (optional)
   - Status defaults to "arrived"

2. **Start Processing**: `POST /api/v1/arrivals/:id/process`
   - Create processing stage (e.g., "unloading", "inspection")
   - Status defaults to "pending"
   - `startedAt` timestamp set automatically

3. **Update Processing Stage**: `PUT /api/v1/arrivals/:id/process/:stageId`
   - Update stage status
   - When status set to "completed", `completedAt` is set automatically

4. **Update Arrival Status**: `PUT /api/v1/arrivals/:id/status`
   - Change overall arrival status

### Exit Workflow

1. **Create Exit**: `POST /api/v1/exits`
   - Vehicle exits from center
   - Exit type specified (e.g., "delivery", "transfer")
   - Destination center/name recorded (optional)
   - GPS coordinates recorded (optional)

2. **Create Incoming Vehicle** (if inter-center transfer): `POST /api/v1/incoming`
   - Link to exit record
   - Source and destination centers specified
   - Status defaults to "in_transit"
   - Estimated arrival time set (optional)

3. **Update Incoming Vehicle**: `PUT /api/v1/incoming/:id`
   - Update status (e.g., "in_transit", "arrived")
   - Set actual arrival time when vehicle arrives
   - Update distance if needed

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
GET /api/v1/arrivals?page=1&limit=50&search=truck&searchBy=qrCode,notes&sortBy=arrivedAt:DESC&include=vehicle,center
```

## 🆘 Support

For issues and questions, please contact the development team.
