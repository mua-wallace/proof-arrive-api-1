-- Migration: Remove unique constraint on account_id to allow multiple users with same accountId
-- This is required for proper multi-tenant support where multiple agents/users
-- can belong to the same account/tenant
-- 
-- This migration ensures:
-- 1. No unique constraint exists on account_id alone
-- 2. No unique index exists on account_id alone
-- 3. Multiple users can have the same accountId (multi-tenant support)
-- 4. Uniqueness is enforced per accid (user identifier), not accountId

-- Step 1: Drop any unique constraint on account_id alone (not composite)
DO $$
DECLARE
    constraint_name TEXT;
    constraint_def TEXT;
BEGIN
    -- Find unique constraint on account_id alone (not composite with accid or other fields)
    SELECT conname, pg_get_constraintdef(oid)
    INTO constraint_name, constraint_def
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
    AND contype = 'u' -- unique constraints
    AND (
        -- Check if constraint is on account_id alone (not composite)
        (pg_get_constraintdef(oid) LIKE '%account_id%' 
         AND pg_get_constraintdef(oid) NOT LIKE '%accid%'
         AND pg_get_constraintdef(oid) NOT LIKE '%subid%'
         AND pg_get_constraintdef(oid) NOT LIKE '%,%')
        OR
        -- Also check for accountId (camelCase variant)
        (pg_get_constraintdef(oid) LIKE '%accountId%' 
         AND pg_get_constraintdef(oid) NOT LIKE '%accid%'
         AND pg_get_constraintdef(oid) NOT LIKE '%subid%'
         AND pg_get_constraintdef(oid) NOT LIKE '%,%')
    )
    LIMIT 1;
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
        RAISE NOTICE 'Dropped unique constraint: %', constraint_name;
        RAISE NOTICE '  Definition: %', constraint_def;
    ELSE
        RAISE NOTICE 'No unique constraint found on account_id alone';
    END IF;
END $$;

-- Step 2: Drop any unique index on account_id alone and recreate as non-unique
DO $$
DECLARE
    idx_name TEXT;
    idx_def TEXT;
BEGIN
    -- Find unique index on account_id alone
    SELECT indexname, indexdef
    INTO idx_name, idx_def
    FROM pg_indexes
    WHERE tablename = 'users'
    AND indexdef LIKE '%UNIQUE%'
    AND (
        -- Check if index is on account_id alone (not composite)
        (indexdef LIKE '%account_id%' 
         AND indexdef NOT LIKE '%accid%'
         AND indexdef NOT LIKE '%subid%'
         AND indexdef NOT LIKE '%,%')
        OR
        -- Also check for accountId (camelCase variant)
        (indexdef LIKE '%accountId%' 
         AND indexdef NOT LIKE '%accid%'
         AND indexdef NOT LIKE '%subid%'
         AND indexdef NOT LIKE '%,%')
    )
    LIMIT 1;
    
    IF idx_name IS NOT NULL THEN
        -- Drop the unique index
        EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(idx_name);
        RAISE NOTICE 'Dropped unique index: %', idx_name;
        RAISE NOTICE '  Definition: %', idx_def;
        
        -- Recreate as non-unique index if it was idx_users_account
        IF idx_name = 'idx_users_account' OR idx_name LIKE '%account%' THEN
            CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);
            RAISE NOTICE 'Recreated idx_users_account as non-unique index';
        END IF;
    ELSE
        RAISE NOTICE 'No unique index found on account_id alone';
    END IF;
END $$;

-- Step 3: Ensure non-unique indexes exist for performance
-- These indexes are for query performance, not uniqueness constraints
CREATE INDEX IF NOT EXISTS "idx_users_account" ON "users"("account_id");
CREATE INDEX IF NOT EXISTS "idx_users_account_accid" ON "users"("account_id", "accid");

-- Step 4: Verify the fix - show users with same accountId (if any exist)
-- This is just for verification, doesn't affect the migration
DO $$
DECLARE
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count
    FROM (
        SELECT account_id
        FROM users
        WHERE account_id IS NOT NULL
        GROUP BY account_id
        HAVING COUNT(*) > 1
    ) subquery;
    
    IF user_count > 0 THEN
        RAISE NOTICE 'Verification: Found % account(s) with multiple users', user_count;
    ELSE
        RAISE NOTICE 'Verification: No accounts with multiple users found yet (this is expected for new databases)';
    END IF;
END $$;
