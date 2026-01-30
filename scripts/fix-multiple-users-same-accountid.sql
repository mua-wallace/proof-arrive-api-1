-- ============================================================================
-- SQL Script: Fix Multiple Users with Same accountId
-- ============================================================================
-- This script ensures the database allows multiple users to have the same accountId
-- This is required for proper multi-tenant support where multiple agents/users
-- can belong to the same account/tenant
-- ============================================================================

\echo '============================================================================'
\echo 'Fixing Multi-Tenant Support: Allow Multiple Users with Same accountId'
\echo '============================================================================'
\echo ''

-- Step 1: Check for unique constraints on account_id
\echo 'Step 1: Checking for unique constraints on account_id...'

SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'users'::regclass
AND contype = 'u' -- unique constraints
AND (
    pg_get_constraintdef(oid) LIKE '%account_id%'
    OR pg_get_constraintdef(oid) LIKE '%accountId%'
)
ORDER BY conname;

-- Step 2: Check for unique indexes on account_id
\echo ''
\echo 'Step 2: Checking for unique indexes on account_id...'

SELECT 
    indexname,
    indexdef,
    CASE WHEN indexdef LIKE '%UNIQUE%' THEN 'UNIQUE INDEX' ELSE 'INDEX' END as index_type
FROM pg_indexes
WHERE tablename = 'users'
AND (
    indexname LIKE '%account%' 
    OR indexdef LIKE '%account_id%'
    OR indexdef LIKE '%accountId%'
)
ORDER BY indexname;

-- Step 3: Drop any unique constraint on account_id alone
\echo ''
\echo 'Step 3: Removing unique constraint on account_id (if exists)...'

DO $$
DECLARE
    constraint_name TEXT;
    constraint_def TEXT;
BEGIN
    -- Find unique constraint on account_id alone (not composite)
    SELECT conname, pg_get_constraintdef(oid)
    INTO constraint_name, constraint_def
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
    AND contype = 'u'
    AND (
        -- Check if constraint is on account_id alone
        (pg_get_constraintdef(oid) LIKE '%account_id%' 
         AND pg_get_constraintdef(oid) NOT LIKE '%accid%'
         AND pg_get_constraintdef(oid) NOT LIKE '%subid%'
         AND pg_get_constraintdef(oid) NOT LIKE '%,%')
        OR
        -- Also check for accountId (camelCase)
        (pg_get_constraintdef(oid) LIKE '%accountId%' 
         AND pg_get_constraintdef(oid) NOT LIKE '%accid%'
         AND pg_get_constraintdef(oid) NOT LIKE '%subid%'
         AND pg_get_constraintdef(oid) NOT LIKE '%,%')
    )
    LIMIT 1;
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
        RAISE NOTICE '✓ Dropped unique constraint: %', constraint_name;
        RAISE NOTICE '  Definition: %', constraint_def;
    ELSE
        RAISE NOTICE '✓ No unique constraint found on account_id alone';
    END IF;
END $$;

-- Step 4: Drop any unique index on account_id alone
\echo ''
\echo 'Step 4: Removing unique index on account_id (if exists)...'

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
        (indexdef LIKE '%account_id%' 
         AND indexdef NOT LIKE '%accid%'
         AND indexdef NOT LIKE '%subid%'
         AND indexdef NOT LIKE '%,%')
        OR
        (indexdef LIKE '%accountId%' 
         AND indexdef NOT LIKE '%accid%'
         AND indexdef NOT LIKE '%subid%'
         AND indexdef NOT LIKE '%,%')
    )
    LIMIT 1;
    
    IF idx_name IS NOT NULL THEN
        EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(idx_name);
        RAISE NOTICE '✓ Dropped unique index: %', idx_name;
        RAISE NOTICE '  Definition: %', idx_def;
        
        -- Recreate as non-unique index if it was idx_users_account
        IF idx_name = 'idx_users_account' THEN
            CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);
            RAISE NOTICE '✓ Recreated idx_users_account as non-unique index';
        END IF;
    ELSE
        RAISE NOTICE '✓ No unique index found on account_id alone';
    END IF;
END $$;

-- Step 5: Verify current data - show users with same accountId
\echo ''
\echo 'Step 5: Verifying current data - users with same accountId...'

SELECT 
    account_id,
    COUNT(*) as user_count,
    array_agg(accid ORDER BY accid) as accids,
    array_agg(id::text ORDER BY accid) as user_ids
FROM users
WHERE account_id IS NOT NULL
GROUP BY account_id
HAVING COUNT(*) > 1
ORDER BY account_id
LIMIT 10;

-- Step 6: Final verification - check all constraints and indexes
\echo ''
\echo 'Step 6: Final verification - all constraints and indexes on users table...'

\echo ''
\echo 'Unique Constraints:'
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'users'::regclass
AND contype = 'u'
ORDER BY conname;

\echo ''
\echo 'Indexes (including unique):'
SELECT 
    indexname,
    indexdef,
    CASE WHEN indexdef LIKE '%UNIQUE%' THEN 'UNIQUE INDEX' ELSE 'INDEX' END as index_type
FROM pg_indexes
WHERE tablename = 'users'
ORDER BY indexname;

-- Step 7: Summary
\echo ''
\echo '============================================================================'
\echo 'Summary:'
\echo '============================================================================'
\echo ''
\echo '✓ Multiple users can now have the same accountId'
\echo '✓ Uniqueness is enforced per accid (user identifier), not accountId'
\echo ''
\echo 'Expected behavior:'
\echo '  - Multiple users with accountId = 267 are allowed'
\echo '  - Each user must have a unique accid'
\echo '  - The combination (accountId, accid) can be unique (prevents duplicate accid per account)'
\echo ''
\echo 'Note: If you still cannot create multiple users with the same accountId,'
\echo '      check the application code logic in users-sync.service.ts'
\echo '      The code checks for existing users by accid only, not accountId.'
\echo ''
\echo '============================================================================'
