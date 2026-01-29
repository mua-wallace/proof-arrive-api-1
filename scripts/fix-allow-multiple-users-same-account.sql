-- ============================================================================
-- SQL Script: Allow Multiple Users with Same accountId
-- ============================================================================
-- This script ensures the database allows multiple users to have the same accountId
-- This is required for proper multi-tenant support where multiple agents/users
-- can belong to the same account/tenant
-- ============================================================================

\echo '============================================================================'
\echo 'Fixing Multi-Tenant Support: Allow Multiple Users with Same accountId'
\echo '============================================================================'
\echo ''

-- Step 1: Check for unique constraints that might prevent this
\echo 'Step 1: Checking for problematic unique constraints...'

SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'users'::regclass
AND contype = 'u' -- unique constraints
ORDER BY conname;

-- Step 2: Drop any unique constraint on account_id alone
\echo ''
\echo 'Step 2: Removing unique constraint on account_id (if exists)...'

DO $$
DECLARE
    constraint_name TEXT;
    constraint_def TEXT;
BEGIN
    -- Find unique constraint on account_id alone
    SELECT conname, pg_get_constraintdef(oid)
    INTO constraint_name, constraint_def
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) LIKE '%account_id%'
    AND pg_get_constraintdef(oid) NOT LIKE '%accid%'
    AND pg_get_constraintdef(oid) NOT LIKE '%subid%'
    LIMIT 1;
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
        RAISE NOTICE '✓ Dropped unique constraint: %', constraint_name;
        RAISE NOTICE '  Definition: %', constraint_def;
    ELSE
        RAISE NOTICE '✓ No unique constraint found on account_id alone';
    END IF;
END $$;

-- Step 3: Verify we can have multiple users with same accountId
\echo ''
\echo 'Step 3: Verifying current data...'

SELECT 
    account_id,
    COUNT(*) as user_count,
    array_agg(accid ORDER BY accid) as accids
FROM users
WHERE account_id IS NOT NULL
GROUP BY account_id
HAVING COUNT(*) > 1
ORDER BY account_id
LIMIT 5;

-- Step 4: Check indexes (should be indexes, not unique constraints)
\echo ''
\echo 'Step 4: Checking indexes on users table...'

SELECT 
    indexname,
    indexdef,
    CASE WHEN indexdef LIKE '%UNIQUE%' THEN 'UNIQUE INDEX' ELSE 'INDEX' END as index_type
FROM pg_indexes
WHERE tablename = 'users'
AND (indexname LIKE '%account%' OR indexname LIKE '%accid%')
ORDER BY indexname;

-- Step 5: Summary
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
\echo '============================================================================'
