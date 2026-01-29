# Database Migrations Guide

This document describes the migration files and their execution order.

## Migration Files

All migrations are located in `src/database/migrations/` and are executed in alphabetical order.

### Migration Order

1. **0000_complete_thena.sql** - Initial schema creation
   - Creates all base tables (users, vehicles, centers, arrivals, exits, etc.)
   - Includes unique constraint on `vehicles.third_party_id`

2. **0001_update_centers_schema.sql** - Updates centers table structure
   - Adds Malambi API fields to centers
   - Adds unique constraints on `centers.third_party_id` and `centers.siteid`
   - Uses DO blocks for conditional constraint creation

3. **0002_add_created_by_fields.sql** - Adds created_by fields
   - Adds `created_by` column to arrivals, exits, and incoming_vehicles

4. **0002_next_venom.sql** - Additional schema updates
   - Drops old constraints and adds new ones

5. **0003_add_status_to_exits.sql** - Adds status to exits
   - Adds status column to exits table

6. **0003_fine_alice.sql** - Adds account_id columns (initial)
   - Adds `account_id` column to all tables
   - Sets default values and makes columns NOT NULL
   - **Note**: Does NOT add foreign keys (handled in 0004)

7. **0004_fix_foreign_key_constraints.sql** - Fixes foreign key constraints
   - Ensures unique constraints exist on `vehicles.third_party_id` and `centers.geozone_id`
   - Drops old foreign key constraints
   - Adds correct foreign key constraints referencing `third_party_id` and `geozone_id`
   - Uses DO blocks for conditional operations

8. **0005_add_user_fields.sql** - Adds user fields
   - Adds `email`, `role`, and `fullname` columns to users table
   - Sets defaults and constraints
   - Uses DO blocks for conditional operations

9. **0006_add_qr_code_to_vehicles.sql** - Adds QR code to vehicles
   - Adds `qr_code` column to vehicles table
   - Creates indexes

10. **0007_add_account_id_column.sql** - Comprehensive account_id migration
    - Ensures `account_id` exists on all tables (handles case where 0003 already added it)
    - Properly populates `account_id` from relationships
    - Makes columns NOT NULL using DO blocks
    - Creates all necessary indexes

## Migration Runner

The migration runner (`scripts/run-migrations.js`) handles:

- **DO Blocks**: PostgreSQL anonymous code blocks (`DO $$ ... END $$`) are kept together as single statements
- **Statement Breakpoints**: Drizzle-kit format (`--> statement-breakpoint`) is handled correctly
- **Error Handling**: Skips "already exists" errors, handles missing columns gracefully
- **Foreign Key Errors**: Skips foreign key constraint errors if unique constraints don't exist yet (they'll be added in later migrations)

## Running Migrations

Migrations run automatically:
- **At container startup**: `scripts/start-with-migrations.sh` runs migrations before starting the app
- **Manually**: `npm run migrate` or `node scripts/run-migrations.js`

## Important Notes

1. **Migration 0003** adds `account_id` columns but migration **0007** ensures they're properly populated
2. **Migration 0004** must run after **0003** to create unique constraints before foreign keys
3. **Migration 0005** adds `email` and `role` columns - code handles missing columns gracefully
4. All migrations use `IF NOT EXISTS` and `IF EXISTS` checks for idempotency

## Troubleshooting

If migrations fail:
1. Check PostgreSQL logs for specific errors
2. Verify database connection settings
3. Ensure migrations run in order (alphabetical by filename)
4. Check if columns/constraints already exist (errors are logged but may be safe to ignore)
