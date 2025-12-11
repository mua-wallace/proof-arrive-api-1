# Docker Build with Database Migrations

This document explains how database migrations are handled during the Docker build process.

## Overview

The Dockerfile has been configured to:
1. **Generate migrations** at build time from schema changes
2. **Optionally run migrations** at build time if database credentials are provided
3. **Run migrations at startup** if they weren't run at build time

## Build Time Migrations

### Option 1: Build with Database Connection (Recommended for CI/CD)

If you have database credentials available during build, you can run migrations at build time:

```bash
docker build \
  --build-arg DATABASE_HOST=your-db-host \
  --build-arg DATABASE_PORT=5432 \
  --build-arg DATABASE_USERNAME=postgres \
  --build-arg DATABASE_PASSWORD=your-password \
  --build-arg DATABASE_NAME=proof_arrive \
  -t proof-arrive-api:latest .
```

This will:
- Generate migrations from schema changes
- Run migrations against the specified database
- Create a production image with migrations already applied

### Option 2: Build without Database Connection

If you don't have database credentials at build time:

```bash
docker build -t proof-arrive-api:latest .
```

This will:
- Generate migrations from schema changes
- Skip running migrations (they'll be run at container startup)
- Create a production image ready to run migrations on first start

## Runtime Migrations

If migrations weren't run at build time, the container will automatically attempt to run them on startup using the environment variables:

```bash
docker run -e DATABASE_HOST=db \
  -e DATABASE_PORT=5432 \
  -e DATABASE_USERNAME=postgres \
  -e DATABASE_PASSWORD=password \
  -e DATABASE_NAME=proof_arrive \
  proof-arrive-api:latest
```

The startup script (`scripts/start-with-migrations.sh`) will:
1. Check if database environment variables are set
2. Run any pending migrations
3. Start the application

## Manual Migration Commands

You can also run migrations manually inside a container:

```bash
# Generate migrations (if schema changed)
docker exec -it <container> npm run db:generate

# Run migrations
docker exec -it <container> npm run db:migrate

# Push schema directly (development only)
docker exec -it <container> npm run db:push
```

## Docker Compose

When using Docker Compose, migrations will run automatically on startup if the database is available. Make sure your `docker-compose.yml` includes:

```yaml
services:
  proof-arrive-api:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_USERNAME: ${DATABASE_USERNAME}
      DATABASE_PASSWORD: ${DATABASE_PASSWORD}
      DATABASE_NAME: ${DATABASE_NAME}
    depends_on:
      postgres:
        condition: service_healthy
```

## Best Practices

1. **Development**: Use `docker-compose-dev.yml` which mounts volumes and allows live schema changes
2. **Staging/Production**: Build images with migrations already applied using build args
3. **CI/CD**: Run migrations at build time in your CI pipeline before deploying
4. **Zero Downtime**: For production, consider running migrations separately before deploying new containers

## Troubleshooting

### Migrations fail at build time
- Check that database credentials are correct
- Ensure the database is accessible from the build environment
- Migrations will be retried at runtime if build-time migration fails

### Migrations fail at runtime
- Verify all database environment variables are set correctly
- Check database connectivity from the container
- Review migration logs in container output

### No migrations generated
- This is normal if there are no schema changes
- Check that schema files are being copied into the Docker build context

