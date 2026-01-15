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

# Optional: Run migrations at build time if database credentials are provided
# This requires build args: --build-arg DATABASE_HOST=... DATABASE_PORT=... etc.
ARG DATABASE_HOST
ARG DATABASE_PORT=5432
ARG DATABASE_USERNAME
ARG DATABASE_PASSWORD
ARG DATABASE_NAME

# Optional: Run migrations at build time if database credentials are provided
# This requires build args: --build-arg DATABASE_HOST=... DATABASE_PORT=... etc.
# Note: Migrations will also run at container startup, so this is optional
RUN if [ -n "$DATABASE_HOST" ] && [ -n "$DATABASE_NAME" ]; then \
      echo "Running database migrations at build time..." && \
      export DATABASE_HOST="$DATABASE_HOST" && \
      export DATABASE_PORT="${DATABASE_PORT:-5432}" && \
      export DATABASE_USERNAME="${DATABASE_USERNAME:-postgres}" && \
      export DATABASE_PASSWORD="$DATABASE_PASSWORD" && \
      export DATABASE_NAME="$DATABASE_NAME" && \
      node scripts/run-migrations.js || \
      (echo "Warning: Migrations could not be run at build time. They will run at container startup." && true); \
    else \
      echo "Database credentials not provided at build time. Migrations will run at container startup."; \
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

# Make scripts executable
RUN chmod +x scripts/*.sh || true

# Use the startup script as default command
# This will run migrations if needed, then start the app
CMD [ "sh", "scripts/start-with-migrations.sh" ]

