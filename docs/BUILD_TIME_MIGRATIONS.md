# Build-Time Migrations

This document explains how database migrations are executed during the Docker build process.

## Overview

Migrations can be executed **during the Docker build phase** when database credentials are provided and the database is accessible. This ensures that:

1. The database schema is ready before the application starts
2. Faster container startup (no migration wait time)
3. Better CI/CD integration
4. Graceful fallback: if build-time migrations fail (e.g., database not accessible), migrations run at startup

**Important**: Build-time migrations are **optional by default**. They will gracefully skip if:
- The database is not accessible during build (e.g., using Docker service names like "postgres")
- Connection fails (normal in local Docker builds)
- Credentials are not provided

Migrations will automatically run at container startup if they weren't run at build time.

## How It Works

### Build Process

1. **Build Stage**: Application code is compiled
2. **Migration Stage**: Migrations are executed against the database (if credentials provided)
3. **Production Stage**: Final image is created with migrations already applied

### Migration Status Tracking

- If migrations run successfully at build time, a marker file is created: `/tmp/.migrations-run-at-build`
- At container startup, this marker is checked
- If the marker exists, migrations are skipped
- If the marker doesn't exist, migrations run at startup (fallback)

## Usage

### Option 1: Build with Migrations (CI/CD Recommended)

Build the image with database credentials (database must be accessible from build context):

```bash
docker build \
  --build-arg DATABASE_HOST=your-db-host-or-ip \
  --build-arg DATABASE_PORT=5432 \
  --build-arg DATABASE_USERNAME=postgres \
  --build-arg DATABASE_PASSWORD=your-password \
  --build-arg DATABASE_NAME=proof_arrive \
  --build-arg SKIP_BUILD_MIGRATIONS=false \
  -t proof-arrive-api:latest .
```

**Note**: Use actual IP addresses or hostnames that are accessible during build. Docker service names (like "postgres") won't work during build.

This will:
- ✅ Attempt to run migrations during build
- ⚠️ If connection fails, gracefully skip and run at startup
- ✅ Skip migrations at container startup if build-time migrations succeeded

### Option 2: Build Without Build-Time Migrations (Default/Local Development)

For local development where database service names aren't accessible during build:

```bash
docker build -t proof-arrive-api:latest .
```

Or explicitly skip:

```bash
docker build \
  --build-arg SKIP_BUILD_MIGRATIONS=true \
  -t proof-arrive-api:latest .
```

This will:
- ⏭️ Skip migrations at build time (default behavior)
- ✅ Run migrations at container startup automatically

**This is the recommended approach for local Docker builds** where the database container isn't running during build.

## Docker Compose

### Production Build (with migrations)

```bash
docker-compose -f docker-compose-build.yml build
docker-compose -f docker-compose-build.yml up -d
```

### Development (migrations at startup)

```bash
docker-compose -f docker-compose-dev.yml up -d
```

## Environment Variables

### Build Arguments

- `DATABASE_HOST` - Database host/IP (must be accessible during build, not Docker service names)
- `DATABASE_PORT` - Database port (default: 5432)
- `DATABASE_USERNAME` - Database username (default: postgres)
- `DATABASE_PASSWORD` - Database password
- `DATABASE_NAME` - Database name
- `SKIP_BUILD_MIGRATIONS` - Set to `true` to skip build-time migrations (default: `true` for safety)
- `REQUIRE_BUILD_MIGRATIONS` - Set to `true` to fail build if migrations can't run (default: `false`)

### Runtime Environment Variables

These are still required for the application to run:

- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_USERNAME`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`

## CI/CD Integration

### GitHub Actions / GitLab CI Example

```yaml
- name: Build Docker image with migrations
  run: |
    docker build \
      --build-arg DATABASE_HOST=${{ secrets.DATABASE_HOST }} \
      --build-arg DATABASE_PORT=5432 \
      --build-arg DATABASE_USERNAME=${{ secrets.DATABASE_USERNAME }} \
      --build-arg DATABASE_PASSWORD=${{ secrets.DATABASE_PASSWORD }} \
      --build-arg DATABASE_NAME=${{ secrets.DATABASE_NAME }} \
      -t proof-arrive-api:${{ github.sha }} .
```

## Benefits

1. **Early Failure Detection**: Migration errors are caught during build, not deployment
2. **Faster Startup**: No migration wait time when containers start
3. **Consistent Deployments**: Schema is guaranteed to be correct before deployment
4. **Better CI/CD**: Build process validates database compatibility

## Troubleshooting

### Build fails with "Migrations failed at build time"

- Check database credentials are correct
- Ensure database is accessible from build environment
- Verify network connectivity
- Check migration files for errors

### Migrations run at startup even after build-time migration

- Check if marker file exists: `docker exec <container> ls -la /tmp/.migrations-run-at-build`
- Verify migrations actually completed during build (check build logs)
- Marker file might not have been copied correctly

### Want to force migrations at startup

Set `SKIP_BUILD_MIGRATIONS=true` or don't provide database credentials during build.

## Migration Script

The migration script (`scripts/run-migrations.js`) is used both at:
- **Build time**: Executed during Docker build
- **Runtime**: Executed at container startup (if not run at build time)

The script is idempotent - it's safe to run multiple times.
