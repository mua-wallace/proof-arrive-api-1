# Manual Migration Guide

This guide explains how to run database migrations manually on your server.

## Prerequisites

- Database connection credentials (host, port, username, password, database name)
- Access to the server/container where the application is running
- Node.js installed (if running outside Docker)

## Method 1: Inside Docker Container (Recommended)

If your application is running in a Docker container:

```bash
# 1. Find your container name/ID
docker ps

# 2. Execute migrations inside the container
docker exec -it <container-name> node scripts/run-migrations.js

# Example:
docker exec -it proof-arrive-api node scripts/run-migrations.js
```

### With Environment Variables

If your container doesn't have environment variables set, you can pass them:

```bash
docker exec -it <container-name> sh -c \
  "DATABASE_HOST=your-host \
   DATABASE_PORT=5432 \
   DATABASE_USERNAME=postgres \
   DATABASE_PASSWORD=your-password \
   DATABASE_NAME=proof_arrive \
   node scripts/run-migrations.js"
```

## Method 2: Using npm Script

If you have access to the project directory:

```bash
# Set environment variables first
export DATABASE_HOST=your-host
export DATABASE_PORT=5432
export DATABASE_USERNAME=postgres
export DATABASE_PASSWORD=your-password
export DATABASE_NAME=proof_arrive

# Run migrations
npm run migrate
```

## Method 3: Direct Node.js Execution

Run the migration script directly:

```bash
# Set environment variables
export DATABASE_HOST=your-host
export DATABASE_PORT=5432
export DATABASE_USERNAME=postgres
export DATABASE_PASSWORD=your-password
export DATABASE_NAME=proof_arrive

# Run the script
node scripts/run-migrations.js
```

## Method 4: Using Docker Compose

If you're using docker-compose:

```bash
# Run migrations in the service container
docker-compose exec proof-arrive-api node scripts/run-migrations.js

# Or with environment file
docker-compose --env-file .env exec proof-arrive-api node scripts/run-migrations.js
```

## Method 5: Direct PostgreSQL Connection

If you have direct PostgreSQL access, you can run migrations manually:

```bash
# Connect to PostgreSQL
psql -h your-host -p 5432 -U postgres -d proof_arrive

# Then run each migration file in order:
\i src/database/migrations/0000_complete_thena.sql
\i src/database/migrations/0001_update_centers_schema.sql
\i src/database/migrations/0002_add_created_by_fields.sql
# ... etc
```

## Environment Variables

The migration script uses these environment variables:

- `DATABASE_HOST` - Database host (default: localhost)
- `DATABASE_PORT` - Database port (default: 5432)
- `DATABASE_USERNAME` - Database username (default: postgres)
- `DATABASE_PASSWORD` - Database password (default: postgres)
- `DATABASE_NAME` - Database name (default: proof_arrive)

## Troubleshooting

### Migration Script Not Found

If you get "Migration script not found":

```bash
# Check current directory
pwd

# List files
ls -la scripts/

# If in production, migrations might be in dist/scripts/
node dist/scripts/run-migrations.js
```

### Migrations Directory Not Found

```bash
# Check if migrations directory exists
ls -la src/database/migrations/

# In production, it should be at the root:
ls -la src/database/migrations/
```

### Connection Errors

```bash
# Test database connection first
psql -h your-host -p 5432 -U postgres -d proof_arrive

# Or test with Node.js
node -e "
const { Client } = require('pg');
const client = new Client({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME
});
client.connect()
  .then(() => { console.log('Connected!'); client.end(); })
  .catch(err => { console.error('Error:', err.message); process.exit(1); });
"
```

### Check Migration Status

The migration script tracks which migrations have run. Check the database:

```sql
-- Connect to your database
psql -h your-host -U postgres -d proof_arrive

-- Check if migrations table exists
SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at;

-- Or check for specific columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('email', 'role', 'account_id');
```

## Running Specific Migrations

To run a specific migration file:

```bash
# Method 1: Using psql
psql -h your-host -U postgres -d proof_arrive -f src/database/migrations/0005_add_user_fields.sql

# Method 2: Copy file into container and run
docker cp src/database/migrations/0005_add_user_fields.sql <container-name>:/tmp/
docker exec -it <container-name> psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -f /tmp/0005_add_user_fields.sql
```

## Verification

After running migrations, verify they worked:

```sql
-- Check if email and role columns exist
\d users

-- Or query directly
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('email', 'role', 'account_id');
```

## Quick Reference

```bash
# Most common: Run migrations in Docker container
docker exec -it proof-arrive-api node scripts/run-migrations.js

# With custom environment
docker exec -it proof-arrive-api sh -c \
  "DATABASE_HOST=db DATABASE_NAME=proof_arrive node scripts/run-migrations.js"

# Check logs
docker logs proof-arrive-api | grep -i migration

# Verify columns exist
docker exec -it proof-arrive-api psql -h $DATABASE_HOST -U $DATABASE_USERNAME -d $DATABASE_NAME -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('email', 'role');"
```
