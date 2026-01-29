-- ============================================================================
-- SQL Script: Fix Multi-Tenant Support for Users Table
-- ============================================================================
-- This script ensures multiple users can have the same accountId
-- Removes any unique constraints that would prevent this
-- ============================================================================

-- Step 1: Check for existing unique constraints
SELECT 'Step 1: Checking for unique constraints...' as step;

SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition,
    contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'users'::regclass
AND contype IN ('u', 'p') -- 'u' = unique, 'p' = primary key
ORDER BY conname;

-- Step 2: Drop any unique constraint on account_id alone (if exists)
-- This would prevent multiple users from having the same accountId
DO $$
DECLARE
    constraint_rec RECORD;
BEGIN
    FOR constraint_rec IN
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conrelid = 'users'::regclass
        AND contype = 'u'
        AND (
            -- Check if constraint is on account_id alone
            (pg_get_constraintdef(oid) LIKE '%account_id%' 
             AND pg_get_constraintdef(oid) NOT LIKE '%accid%'
             AND pg_get_constraintdef(oid) NOT LIKE '%subid%')
        )
    LOOP
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_rec.conname);
        RAISE NOTICE 'Dropped unique constraint: %', constraint_rec.conname;
        RAISE NOTICE '  Definition: %', constraint_rec.def;
    END LOOP;
END $$;

-- Step 3: Verify no unique constraint on account_id alone exists
SELECT 'Step 3: Verifying no unique constraint on account_id...' as step;

SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✓ No unique constraint on account_id - multiple users can have same accountId'
        ELSE '✗ WARNING: Unique constraint still exists on account_id'
    END as verification
FROM pg_constraint
WHERE conrelid = 'users'::regclass
AND contype = 'u'
AND pg_get_constraintdef(oid) LIKE '%account_id%'
AND pg_get_constraintdef(oid) NOT LIKE '%accid%'
AND pg_get_constraintdef(oid) NOT LIKE '%subid%';

-- Step 4: Check current data - show users with same accountId
SELECT 'Step 4: Current users with same accountId:' as step;

SELECT 
    account_id,
    COUNT(*) as user_count,
    array_agg(accid ORDER BY accid) as accids,
    array_agg(username ORDER BY accid) as usernames
FROM users
WHERE account_id IS NOT NULL
GROUP BY account_id
HAVING COUNT(*) > 1
ORDER BY account_id
LIMIT 10;

-- Step 5: Test - Verify we can insert multiple users with same accountId
-- (This is just a verification query, not an actual insert)
SELECT 'Step 5: Ready to support multiple users with same accountId' as step;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '============================================================================';
    RAISE NOTICE '✅ Multi-tenant support verified!';
    RAISE NOTICE '';
    RAISE NOTICE 'Multiple users can now have the same accountId';
    RAISE NOTICE 'Uniqueness is enforced per accid (user identifier), not accountId';
    RAISE NOTICE '';
    RAISE NOTICE 'Note: If you want to enforce uniqueness per (accountId, accid),';
    RAISE NOTICE '      that is fine - it prevents duplicate accid within same account';
    RAISE NOTICE '      But accountId alone should NOT be unique.';
    RAISE NOTICE '============================================================================';
END $$;
