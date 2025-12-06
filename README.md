# Proof Arrive API

A NestJS-based REST API for managing vehicle arrivals, exits, and related operations. Built with TypeScript, Drizzle ORM, and PostgreSQL.

## 🚀 Features

- **RESTful API** with NestJS framework
- **PostgreSQL Database** with Drizzle ORM
- **Docker Support** for easy deployment
- **Swagger Documentation** for API exploration
- **TypeScript** for type safety
- **Environment-based Configuration** with Joi validation
- **Error Handling** with Sentry integration
- **CORS** support for cross-origin requests
- **Validation** with class-validator
- **Base Service** for common CRUD operations

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
- `APP_NAME` - Application name
- `APP_DOCS` - Swagger documentation path (default: docs)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins

### Database

- `DATABASE_HOST` - Database host
- `DATABASE_PORT` - Database port (default: 5432)
- `DATABASE_USERNAME` - Database username
- `DATABASE_PASSWORD` - Database password
- `DATABASE_NAME` - Database name
- `DATABASE_LOGGING` - Enable database query logging (true/false)

## 🗄️ Database

### Migrations

Generate migrations with Drizzle Kit:

```bash
npx drizzle-kit generate
```

Run migrations:

```bash
npx drizzle-kit migrate
```

### Database Schema

Database schemas are defined in `src/modules/schemas/`. The base schema includes:

- `id` (UUID, primary key)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)
- `deletedAt` (timestamp, nullable for soft deletes)

## 📚 API Documentation

Once the application is running, access the Swagger documentation at:

- **Local**: <http://localhost:5000/docs>
- **Docker**: <http://localhost:5001/docs>

The Swagger UI provides:

- Interactive API exploration
- Request/response schemas
- Authentication testing
- Dark theme interface

## 🏗️ Available Modules

### Vehicles

Manage vehicle information and operations.

### Arrivals

Track vehicle arrivals at centers.

### Exits

Track vehicle exits from centers.

### Incoming

Handle incoming vehicle operations.

### Centers

Manage center/location information.

### Users

User management and authentication.

### Reports

Generate and manage reports.

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
- **Services**: Business logic in `*.service.ts` files
- **Controllers**: API endpoints in `*.controller.ts` files
- **DTOs**: Data transfer objects in `dto/` folders
- **Schemas**: Database schemas in `src/modules/schemas/`
- **Base Service**: Reusable CRUD operations in `src/common/services/base.service.ts`

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

## 🔒 Security

- Environment variables for sensitive data
- CORS configuration for allowed origins
- Input validation with class-validator
- Error tracking with Sentry (production)
- SQL injection protection via Drizzle ORM

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

## 🆘 Support

For issues and questions, please contact the development team.
