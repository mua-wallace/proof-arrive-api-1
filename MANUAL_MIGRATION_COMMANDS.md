# Manual Migration Commands

If automatic migrations aren't working in production, you can run migrations manually using one of these methods:

## Option 1: Using the Manual Migration Script (Recommended)

If you have access to the server/container:

```bash
# Make the script executable
chmod +x scripts/run-migrations-manual.sh

# Run migrations
sh scripts/run-migrations-manual.sh
```

Or if you're inside a Docker container:

```bash
# Inside the container
cd /usr/src/app
sh scripts/run-migrations-manual.sh
```

## Option 2: Using Node.js Migration Script

If you have Node.js available:

```bash
# Set environment variables
export DATABASE_HOST=your-host
export DATABASE_PORT=5432
export DATABASE_USERNAME=postgres
export DATABASE_PASSWORD=your-password
export DATABASE_NAME=proof_arrive

# Run migrations
node scripts/run-migrations.js
```

## Option 3: Using psql Directly

If you have `psql` installed and can connect to the database:

```bash
# Set password
export PGPASSWORD=your-password

# Run each migration file in order
psql -h your-host -p 5432 -U postgres -d proof_arrive -f src/database/migrations/0000_complete_thena.sql
psql -h your-host -p 5432 -U postgres -d proof_arrive -f src/database/migrations/0001_update_centers_schema.sql
psql -h your-host -p 5432 -U postgres -d proof_arrive -f src/database/migrations/0002_add_created_by_fields.sql
psql -h your-host -p 5432 -U postgres -d proof_arrive -f src/database/migrations/0003_add_status_to_exits.sql
```

## Option 4: Quick Fix - Add Missing Column Only

If you just need to add the `status` column to fix the immediate error:

```bash
export PGPASSWORD=your-password

psql -h your-host -p 5432 -U postgres -d proof_arrive <<EOF
ALTER TABLE "exits" ADD COLUMN IF NOT EXISTS "status" varchar(50);
CREATE INDEX IF NOT EXISTS "idx_exits_status" ON "exits"("status");
EOF
```

Or using a single command:

```bash
PGPASSWORD=your-password psql -h your-host -p 5432 -U postgres -d proof_arrive -c "ALTER TABLE \"exits\" ADD COLUMN IF NOT EXISTS \"status\" varchar(50); CREATE INDEX IF NOT EXISTS \"idx_exits_status\" ON \"exits\"(\"status\");"
```

## Option 5: Using Docker Exec

If your app is running in a Docker container:

```bash
# Find your container
docker ps

# Execute migrations inside the container
docker exec -it your-container-name sh scripts/run-migrations-manual.sh

# Or run the Node.js script
docker exec -it your-container-name node scripts/run-migrations.js
```

## Verify Migrations Ran

After running migrations, verify the `status` column exists:

```bash
PGPASSWORD=your-password psql -h your-host -p 5432 -U postgres -d proof_arrive -c "\d exits"
```

You should see the `status` column in the output.
