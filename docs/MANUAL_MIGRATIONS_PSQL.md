# Running migrations manually in psql

Use this when you connect to the database with `psql` on the server and want to run each migration file by hand.

## 1. Connect to the database

```bash
psql "postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE_NAME"
```

Example:

```bash
psql "postgresql://postgres:yourpassword@localhost:5432/proof_arrive"
```

Or step by step:

```bash
psql -h HOST -p PORT -U USERNAME -d DATABASE_NAME
# Enter password when prompted
```

---

## 2. Run each migration file in order

From the **psql** prompt, use `\i` to run a file. Paths are relative to the directory you started psql from, or use the full path to the migration file.

**If you're in the project root** (e.g. `/path/to/proof-arrive-api`):

```sql
\i src/database/migrations/0000_complete_thena.sql
\i src/database/migrations/0001_update_centers_schema.sql
\i src/database/migrations/0002_add_created_by_fields.sql
\i src/database/migrations/0002_next_venom.sql
\i src/database/migrations/0003_add_status_to_exits.sql
\i src/database/migrations/0003_fine_alice.sql
\i src/database/migrations/0004_fix_foreign_key_constraints.sql
\i src/database/migrations/0005_add_user_fields.sql
\i src/database/migrations/0006_add_qr_code_to_vehicles.sql
\i src/database/migrations/0007_add_account_id_column.sql
\i src/database/migrations/0008_remove_unique_constraint_account_id.sql
\i src/database/migrations/0009_create_qr_codes_table.sql
\i src/database/migrations/0010_create_vehicle_groups_table.sql
\i src/database/migrations/0011_add_unique_constraint_users_accid_subid.sql
\i src/database/migrations/0012_add_vehicle_status_tracking.sql
\i src/database/migrations/0013_add_vehicle_center_assignment.sql
\i src/database/migrations/0014_use_third_party_id_as_primary_key.sql
\i src/database/migrations/0015_use_subid_as_user_id.sql
\i src/database/migrations/0016_create_trips_and_events.sql
\i src/database/migrations/0017_add_queue_date_daily_reset.sql
```

**If you're inside the migrations folder** (e.g. `cd src/database/migrations` then `psql ...`):

```sql
\i 0000_complete_thena.sql
\i 0001_update_centers_schema.sql
\i 0002_add_created_by_fields.sql
\i 0002_next_venom.sql
\i 0003_add_status_to_exits.sql
\i 0003_fine_alice.sql
\i 0004_fix_foreign_key_constraints.sql
\i 0005_add_user_fields.sql
\i 0006_add_qr_code_to_vehicles.sql
\i 0007_add_account_id_column.sql
\i 0008_remove_unique_constraint_account_id.sql
\i 0009_create_qr_codes_table.sql
\i 0010_create_vehicle_groups_table.sql
\i 0011_add_unique_constraint_users_accid_subid.sql
\i 0012_add_vehicle_status_tracking.sql
\i 0013_add_vehicle_center_assignment.sql
\i 0014_use_third_party_id_as_primary_key.sql
\i 0015_use_subid_as_user_id.sql
\i 0016_create_trips_and_events.sql
\i 0017_add_queue_date_daily_reset.sql
```

---

## 3. Stop on first error (optional)

Before running the first `\i`, turn on stop-on-error:

```sql
\set ON_ERROR_STOP on
```

Then run the `\i` commands above. If one fails, psql will stop instead of continuing.

---

## 4. One-liner from the shell (still “manual” psql)

If you prefer to stay in a normal shell but still use a single psql session for all files:

```bash
cd /path/to/proof-arrive-api

# With connection string
psql "postgresql://USER:PASS@HOST:5432/proof_arrive" -v ON_ERROR_STOP=1 \
  -f src/database/migrations/0000_complete_thena.sql \
  -f src/database/migrations/0001_update_centers_schema.sql \
  -f src/database/migrations/0002_add_created_by_fields.sql \
  -f src/database/migrations/0002_next_venom.sql \
  -f src/database/migrations/0003_add_status_to_exits.sql \
  -f src/database/migrations/0003_fine_alice.sql \
  -f src/database/migrations/0004_fix_foreign_key_constraints.sql \
  -f src/database/migrations/0005_add_user_fields.sql \
  -f src/database/migrations/0006_add_qr_code_to_vehicles.sql \
  -f src/database/migrations/0007_add_account_id_column.sql \
  -f src/database/migrations/0008_remove_unique_constraint_account_id.sql \
  -f src/database/migrations/0009_create_qr_codes_table.sql \
  -f src/database/migrations/0010_create_vehicle_groups_table.sql \
  -f src/database/migrations/0011_add_unique_constraint_users_accid_subid.sql \
  -f src/database/migrations/0012_add_vehicle_status_tracking.sql \
  -f src/database/migrations/0013_add_vehicle_center_assignment.sql \
  -f src/database/migrations/0014_use_third_party_id_as_primary_key.sql \
  -f src/database/migrations/0015_use_subid_as_user_id.sql \
  -f src/database/migrations/0016_create_trips_and_events.sql \
  -f src/database/migrations/0017_add_queue_date_daily_reset.sql
```

---

## Order summary (copy-paste list)

| # | Filename |
|---|----------|
| 1 | 0000_complete_thena.sql |
| 2 | 0001_update_centers_schema.sql |
| 3 | 0002_add_created_by_fields.sql |
| 4 | 0002_next_venom.sql |
| 5 | 0003_add_status_to_exits.sql |
| 6 | 0003_fine_alice.sql |
| 7 | 0004_fix_foreign_key_constraints.sql |
| 8 | 0005_add_user_fields.sql |
| 9 | 0006_add_qr_code_to_vehicles.sql |
| 10 | 0007_add_account_id_column.sql |
| 11 | 0008_remove_unique_constraint_account_id.sql |
| 12 | 0009_create_qr_codes_table.sql |
| 13 | 0010_create_vehicle_groups_table.sql |
| 14 | 0011_add_unique_constraint_users_accid_subid.sql |
| 15 | 0012_add_vehicle_status_tracking.sql |
| 16 | 0013_add_vehicle_center_assignment.sql |
| 17 | 0014_use_third_party_id_as_primary_key.sql |
| 18 | 0015_use_subid_as_user_id.sql |
| 19 | 0016_create_trips_and_events.sql |
| 20 | 0017_add_queue_date_daily_reset.sql |

Run them in this order. If a migration was already applied, some statements may error (e.g. “already exists”); you can ignore those or run only the migrations that are still missing.
