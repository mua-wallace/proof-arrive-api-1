# Manual Migration Guide

This guide explains how to manually run database migrations for the Proof Arrive API.

## Quick Reference

**Most common command (container name: `proof-arrive-api`):**

```bash
docker exec -it proof-arrive-api npm run migrate
```

Or directly:
```bash
docker exec -it proof-arrive-api node scripts/run-migrations.js
```

## Prerequisites

Ensure you have the following environment variables set:
- `DATABASE_HOST` - Database hostname
- `DATABASE_PORT` - Database port (default: 5432)
- `DATABASE_USERNAME` - Database username (default: postgres)
- `DATABASE_PASSWORD` - Database password
- `DATABASE_NAME` - Database name (default: proof_arrive)

## Local Development

### Method 1: Using npm script (Recommended)

```bash
npm run migrate
```

This runs `node scripts/run-migrations.js` which executes all SQL migration files in order.

### Method 2: Direct Node.js execution

```bash
node scripts/run-migrations.js
```

### Method 3: With environment variables inline

```bash
DATABASE_HOST=localhost \
DATABASE_PORT=5432 \
DATABASE_USERNAME=postgres \
DATABASE_PASSWORD=your_password \
DATABASE_NAME=proof_arrive \
node scripts/run-migrations.js
```

## Docker Container

### Method 1: Execute inside running container

```bash
# Execute migrations
docker exec -it proof-arrive-api node scripts/run-migrations.js

# Or using npm script
docker exec -it proof-arrive-api npm run migrate
```

### Method 2: Execute with environment variables

```bash
docker exec -it proof-arrive-api \
  -e DATABASE_HOST=your_host \
  -e DATABASE_PORT=5432 \
  -e DATABASE_USERNAME=postgres \
  -e DATABASE_PASSWORD=your_password \
  -e DATABASE_NAME=proof_arrive \
  node scripts/run-migrations.js
```

**Note:** If environment variables are already set in the container (via docker-compose.yml), you don't need to pass them again.

### Method 3: Using docker-compose

```bash
# If using docker-compose, you can exec into the service
docker compose exec proof-arrive-api node scripts/run-migrations.js

# Or with npm script
docker compose exec proof-arrive-api npm run migrate
```

## Production (Portainer/Docker)

### Via Portainer Console

1. Navigate to your container in Portainer
2. Click on "Console" or "Exec" tab
3. Execute:
   ```bash
   node scripts/run-migrations.js
   ```

### Via SSH/Remote Docker

```bash
# SSH into your server
ssh user@your-server

# Execute migrations in the container
docker exec -it proof-arrive-api node scripts/run-migrations.js

# Or using npm script
docker exec -it proof-arrive-api npm run migrate
```

## Migration Script Details

The migration script (`scripts/run-migrations.js`):
- Connects to PostgreSQL using environment variables
- Finds all `.sql` files in `src/database/migrations/`
- Executes them in alphabetical order
- Handles errors gracefully (skips "already exists" errors)
- Provides detailed logging

## Fix Missing account_id Column

If you're getting errors about `account_id` column not existing, run this diagnostic and fix script:

```bash
# In container
docker exec -it proof-arrive-api node scripts/check-and-fix-account-id.js

# Or locally
node scripts/check-and-fix-account-id.js
```

This script will:
- Check if `account_id` column exists in the `users` table
- Add it if missing
- Update existing rows with `account_id = CAST(accid AS integer)`
- Make the column NOT NULL
- Create necessary indexes
- Check other tables for the column

## Troubleshooting

### Check if migrations directory exists

```bash
# In container
ls -la src/database/migrations/

# Should show SQL files like:
# 0000_complete_thena.sql
# 0001_update_centers_schema.sql
# etc.
```

### Verify database connection

```bash
# Test connection from container
node -e "
const { Client } = require('pg');
const client = new Client({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT || 5432,
  user: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME || 'proof_arrive'
});
client.connect()
  .then(() => console.log('✓ Connected!'))
  .catch(err => console.error('✗ Error:', err.message))
  .finally(() => client.end());
"
```

### Check migration script location

```bash
# In container
pwd
ls -la scripts/run-migrations.js
```

### View migration logs

The migration script outputs detailed logs:
- Connection status
- Migration files found
- Each migration execution
- Success/failure status

## Migration Files

Migration files are located at: `src/database/migrations/*.sql`

The script automatically:
- Finds all `.sql` files
- Sorts them alphabetically
- Executes them in order
- Skips statements that already exist (safe to re-run)

## Notes

- Migrations are **idempotent** - safe to run multiple times
- The script handles "already exists" errors gracefully
- All migrations run in a single transaction per file
- Failed migrations will show error messages but won't stop other migrations
