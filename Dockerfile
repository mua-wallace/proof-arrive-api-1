FROM node:22.17.0 AS development

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install

COPY . .

CMD [ "npm", "run", "start:dev" ]

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

# Generate migrations from schema changes
# This will create migration files in src/database/migrations/
RUN echo "Generating database migrations..." && \
    npx drizzle-kit generate --config=src/database/drizzle.config.ts || \
    (echo "No schema changes detected or migration generation skipped" && true)

# Build the application
RUN npm run build

# Optional: Run migrations at build time if database credentials are provided
# This requires build args: --build-arg DATABASE_HOST=... DATABASE_PORT=... etc.
ARG DATABASE_HOST
ARG DATABASE_PORT=5432
ARG DATABASE_USERNAME
ARG DATABASE_PASSWORD
ARG DATABASE_NAME

# Only run migrations if database credentials are provided
RUN if [ -n "$DATABASE_HOST" ] && [ -n "$DATABASE_NAME" ]; then \
      echo "Running database migrations at build time..." && \
      export DATABASE_HOST="$DATABASE_HOST" && \
      export DATABASE_PORT="${DATABASE_PORT:-5432}" && \
      export DATABASE_USERNAME="${DATABASE_USERNAME:-postgres}" && \
      export DATABASE_PASSWORD="$DATABASE_PASSWORD" && \
      export DATABASE_NAME="$DATABASE_NAME" && \
      npx drizzle-kit migrate --config=src/database/drizzle.config.ts || \
      (echo "Warning: Migrations could not be run at build time. They will need to be run manually." && true); \
    else \
      echo "Database credentials not provided at build time. Migrations will need to be run at runtime or manually."; \
    fi

ENV NODE_ENV=production

FROM node:22.17.0 AS production

WORKDIR /usr/src/app

# Copy package files and install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from build stage
COPY --from=build /usr/src/app/dist ./dist

# Copy migration files and scripts for potential runtime migration
COPY --from=build /usr/src/app/src/database/migrations ./src/database/migrations
COPY --from=build /usr/src/app/src/database/drizzle.config.ts ./src/database/drizzle.config.ts
# Copy schema source files (needed for drizzle-kit migrate to work)
COPY --from=build /usr/src/app/src/modules/schemas ./src/modules/schemas
COPY --from=build /usr/src/app/scripts ./scripts
# Ensure Node.js migration script is executable
RUN chmod +x scripts/run-migrations.js || true

# Copy .env file created in build stage (environment variables source)
COPY --from=build /usr/src/app/.env ./.env

# Make scripts executable
RUN chmod +x scripts/*.sh || true

# Note: drizzle-kit is already in dependencies, so it's available for runtime migrations

# Use the migration script as default command
# This will run migrations if needed, then start the app
CMD [ "sh", "scripts/start-with-migrations.sh" ]

