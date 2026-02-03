-- Migration: Add unique constraint on users (accid, subid)
-- Prevents duplicate users with the same accid and subid combination

-- 1. Handle existing duplicates before adding constraint
-- Keep the most recent user (by updated_at or created_at) for each (accid, subid) combination
-- Delete older duplicates
DO $$
DECLARE
    duplicate_record RECORD;
    user_to_keep_id UUID;
BEGIN
    -- Find and handle duplicates
    FOR duplicate_record IN
        SELECT accid, subid, COUNT(*) as count
        FROM users
        WHERE deleted_at IS NULL
        GROUP BY accid, subid
        HAVING COUNT(*) > 1
    LOOP
        -- Keep the user with the most recent updated_at (or created_at if updated_at is NULL)
        SELECT id INTO user_to_keep_id
        FROM users
        WHERE accid = duplicate_record.accid
          AND subid = duplicate_record.subid
          AND deleted_at IS NULL
        ORDER BY 
            COALESCE(updated_at, created_at) DESC NULLS LAST,
            created_at DESC
        LIMIT 1;
        
        -- Soft delete (set deleted_at) for other duplicates
        UPDATE users
        SET deleted_at = NOW()
        WHERE accid = duplicate_record.accid
          AND subid = duplicate_record.subid
          AND deleted_at IS NULL
          AND id != user_to_keep_id;
        
        RAISE NOTICE 'Handled duplicates for accid=%, subid=%. Kept user id=%, soft-deleted % others', 
            duplicate_record.accid, 
            duplicate_record.subid, 
            user_to_keep_id,
            duplicate_record.count - 1;
    END LOOP;
END $$;

-- 2. Add unique index on (accid, subid)
-- This ensures no two active users can have the same accid and subid combination
-- Note: The index allows multiple rows with the same (accid, subid) if deleted_at is set
-- If you want to prevent duplicates even for soft-deleted users, you can add a partial unique index:
-- CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_accid_subid" ON "users"("accid", "subid") WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_accid_subid" ON "users"("accid", "subid") WHERE deleted_at IS NULL;
