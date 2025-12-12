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

# Note: We use drizzle-kit push at runtime instead of generating migrations
# This allows the schema to be synced directly to the database

# Build the application
RUN npm run build

# Optional: Run migrations at build time if database credentials are provided
# This requires build args: --build-arg DATABASE_HOST=... DATABASE_PORT=... etc.
ARG DATABASE_HOST
ARG DATABASE_PORT=5432
ARG DATABASE_USERNAME
ARG DATABASE_PASSWORD
ARG DATABASE_NAME

# Optional: Push schema at build time if database credentials are provided
# This will sync the schema directly to the database without migration files
RUN if [ -n "$DATABASE_HOST" ] && [ -n "$DATABASE_NAME" ]; then \
      echo "Pushing database schema at build time..." && \
      export DATABASE_HOST="$DATABASE_HOST" && \
      export DATABASE_PORT="${DATABASE_PORT:-5432}" && \
      export DATABASE_USERNAME="${DATABASE_USERNAME:-postgres}" && \
      export DATABASE_PASSWORD="$DATABASE_PASSWORD" && \
      export DATABASE_NAME="$DATABASE_NAME" && \
      npx drizzle-kit push --config=src/database/drizzle.config.ts || \
      (echo "Warning: Schema could not be pushed at build time. It will be synced at runtime." && true); \
    else \
      echo "Database credentials not provided at build time. Schema will be synced at runtime."; \
    fi

ENV NODE_ENV=production

FROM node:22.17.0 AS production

WORKDIR /usr/src/app

# Copy package files and install dependencies (including drizzle-kit for schema sync)
COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

# Copy built application from build stage
COPY --from=build /usr/src/app/dist ./dist

# Copy drizzle config and schema source files (needed for drizzle-kit push)
COPY --from=build /usr/src/app/src/database/drizzle.config.ts ./src/database/drizzle.config.ts
# Copy schema source files (needed for drizzle-kit push to work)
COPY --from=build /usr/src/app/src/modules/schemas ./src/modules/schemas
COPY --from=build /usr/src/app/scripts ./scripts

# Copy .env file created in build stage (environment variables source)
COPY --from=build /usr/src/app/.env ./.env

# Make scripts executable
RUN chmod +x scripts/*.sh || true

# Note: drizzle-kit is already in dependencies, so it's available for runtime schema sync

# Use the startup script as default command
# This will sync schema if needed, then start the app
CMD [ "sh", "scripts/start-with-migrations.sh" ]

