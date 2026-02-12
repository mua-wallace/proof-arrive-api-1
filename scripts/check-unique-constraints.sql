-- ============================================================================
-- SQL Script: Check for Unique Constraints on Users Table
-- ============================================================================
-- This script checks for any unique constraints that might prevent
-- multiple users from having the same accountId
-- ============================================================================

-- Check all unique constraints on users table
SELECT 
    conname as constraint_name,
    pg_get_constraintdef(oid) as constraint_definition,
    contype as constraint_type
FROM pg_constraint
WHERE conrelid = 'users'::regclass
AND contype IN ('u', 'p') -- 'u' = unique, 'p' = primary key
ORDER BY conname;

-- Check indexes that might be unique
SELECT 
    indexname,
    indexdef,
    CASE WHEN indexdef LIKE '%UNIQUE%' THEN 'YES' ELSE 'NO' END as is_unique
FROM pg_indexes
WHERE tablename = 'users'
ORDER BY indexname;

-- Check if there's a unique constraint on account_id alone
SELECT 
    conname,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'users'::regclass
AND pg_get_constraintdef(oid) LIKE '%account_id%'
ORDER BY conname;
