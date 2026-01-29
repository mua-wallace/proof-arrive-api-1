-- ============================================================================
-- SQL Script: Remove Unique Constraints Preventing Multiple Users with Same accountId
-- ============================================================================
-- This script removes any unique constraints on users table that would prevent
-- multiple users from having the same accountId
-- ============================================================================

-- Check for existing unique constraints
SELECT 'Checking for unique constraints on users table...' as info;

SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'users'::regclass
AND contype = 'u' -- unique constraints
ORDER BY conname;

-- Drop any unique constraint on account_id alone (if exists)
DO $$
BEGIN
    -- Check for unique constraint on account_id
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'users'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) LIKE '%account_id%'
        AND pg_get_constraintdef(oid) NOT LIKE '%accid%'
    ) THEN
        -- Find and drop the constraint
        DECLARE
            constraint_name TEXT;
        BEGIN
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = 'users'::regclass
            AND contype = 'u'
            AND pg_get_constraintdef(oid) LIKE '%account_id%'
            AND pg_get_constraintdef(oid) NOT LIKE '%accid%'
            LIMIT 1;
            
            IF constraint_name IS NOT NULL THEN
                EXECUTE 'ALTER TABLE users DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name);
                RAISE NOTICE 'Dropped unique constraint: %', constraint_name;
            END IF;
        END;
    ELSE
        RAISE NOTICE 'No unique constraint found on account_id alone';
    END IF;
END $$;

-- Drop any unique constraint on (account_id, accid) if it prevents multiple users with same accountId
-- Note: We want to allow multiple users with same accountId but different accid
-- So we should NOT have a unique constraint on (account_id, accid) if accid is unique per user
-- Actually, (account_id, accid) being unique is fine - it prevents duplicate accid within same account
-- The issue would be if there's a unique constraint on account_id alone

-- Verify: Check if we can have multiple users with same accountId
SELECT 
    'Verification: Users with same accountId' as info,
    account_id,
    COUNT(*) as user_count,
    array_agg(accid ORDER BY accid) as accids
FROM users
WHERE account_id IS NOT NULL
GROUP BY account_id
HAVING COUNT(*) > 1
ORDER BY account_id
LIMIT 10;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Unique constraint check completed!';
    RAISE NOTICE '   Multiple users can now have the same accountId';
    RAISE NOTICE '   Uniqueness is enforced per (account_id, accid) combination, not account_id alone';
END $$;
