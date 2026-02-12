FROM node:22.17.0 AS development

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install

COPY . .

# Make migration scripts executable
RUN chmod +x scripts/*.sh || true

# Use the startup script that runs migrations before starting in dev mode
CMD [ "sh", "scripts/start-with-migrations-dev.sh" ]

FROM node:22.17.0 AS build

WORKDIR /usr/src/app

# Copy package files and install all dependencies (including dev for drizzle-kit)
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

# Copy source code and configuration
COPY . .

# Create .env from .env.example in build stage
RUN cp .env.example .env || echo ".env.example not found, skipping .env creation"

# Make migration scripts executable
RUN chmod +x scripts/*.sh || true

# Note: Migrations are run at container startup using SQL migration files
# The startup script (scripts/start-with-migrations.sh) runs migrations before starting the app

# Build the application
RUN npm run build

# Run migrations at build time
# This requires build args: --build-arg DATABASE_HOST=... DATABASE_PORT=... etc.
# Set SKIP_BUILD_MIGRATIONS=true to skip migrations at build time (they'll run at startup)
# Note: Build-time migrations only work if database is accessible during build (e.g., CI/CD)
# For local Docker builds, migrations will run at container startup automatically
ARG DATABASE_HOST
ARG DATABASE_PORT=5432
ARG DATABASE_USERNAME
ARG DATABASE_PASSWORD
ARG DATABASE_NAME
ARG SKIP_BUILD_MIGRATIONS=true
ARG REQUIRE_BUILD_MIGRATIONS=false

# Run migrations at build time if database credentials are provided and not skipped
RUN if [ "$SKIP_BUILD_MIGRATIONS" != "true" ] && [ -n "$DATABASE_HOST" ] && [ -n "$DATABASE_NAME" ]; then \
      echo "🔄 Attempting to run database migrations at build time..." && \
      echo "   Database: $DATABASE_HOST:$DATABASE_PORT/$DATABASE_NAME" && \
      export DATABASE_HOST="$DATABASE_HOST" && \
      export DATABASE_PORT="${DATABASE_PORT:-5432}" && \
      export DATABASE_USERNAME="${DATABASE_USERNAME:-postgres}" && \
      export DATABASE_PASSWORD="$DATABASE_PASSWORD" && \
      export DATABASE_NAME="$DATABASE_NAME" && \
      if node scripts/run-migrations.js 2>&1; then \
        echo "✅ Migrations completed successfully at build time" && \
        echo "MIGRATIONS_RUN_AT_BUILD=true" > /tmp/.migrations-run-at-build && \
        echo "Migration marker created at /tmp/.migrations-run-at-build"; \
      else \
        MIGRATION_EXIT_CODE=$?; \
        echo "⚠️  Migrations could not be run at build time (exit code: $MIGRATION_EXIT_CODE)" && \
        echo "   This is normal if the database is not accessible during build (e.g., Docker service names)" && \
        echo "   Migrations will run automatically at container startup."; \
        if [ "$REQUIRE_BUILD_MIGRATIONS" = "true" ]; then \
          echo "❌ ERROR: REQUIRE_BUILD_MIGRATIONS=true but migrations failed. Build aborted." && \
          exit 1; \
        else \
          echo "   Build will continue. Migrations will run at container startup."; \
        fi; \
      fi; \
    elif [ "$SKIP_BUILD_MIGRATIONS" = "true" ]; then \
      echo "⏭️  Skipping migrations at build time (SKIP_BUILD_MIGRATIONS=true). Migrations will run at container startup."; \
    else \
      echo "⚠️  Database credentials not provided at build time. Migrations will run at container startup." && \
      echo "   To run migrations at build time, provide: --build-arg DATABASE_HOST=... DATABASE_NAME=... etc."; \
    fi

ENV NODE_ENV=production

FROM node:22.17.0 AS production

WORKDIR /usr/src/app

# Copy package files and install production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force
# Note: We only install production dependencies since migrations use SQL files
# The migration script (run-migrations.js) only needs 'pg' which is a production dependency

# Copy built application from build stage
COPY --from=build /usr/src/app/dist ./dist

# Copy migration files and scripts needed for runtime migrations
# Ensure migrations directory structure is preserved
COPY --from=build /usr/src/app/src/database/migrations ./src/database/migrations
COPY --from=build /usr/src/app/scripts ./scripts

# Verify migrations were copied (for debugging)
RUN echo "Verifying migrations were copied..." && \
    ls -la src/database/migrations/ 2>/dev/null || echo "WARNING: Migrations directory not found" && \
    echo "Migration files: $(ls src/database/migrations/*.sql 2>/dev/null | wc -l) SQL files found"

# Copy .env file created in build stage (environment variables source)
COPY --from=build /usr/src/app/.env ./.env

# Migration status marker will be checked at runtime
# If migrations ran at build time, the marker file exists in the build stage
# We'll check for it at container startup in the startup script

# Make scripts executable
RUN chmod +x scripts/*.sh || true

# Use the startup script as default command
# This will run migrations if they weren't run at build time, then start the app
CMD [ "sh", "scripts/start-with-migrations.sh" ]

