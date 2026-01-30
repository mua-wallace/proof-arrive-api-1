#!/bin/bash

# Script to fix multiple users with same accountId issue
# This script runs the SQL fix and verifies the database state

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}Fix Multiple Users with Same accountId${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${RED}Error: .env file not found${NC}"
    exit 1
fi

# Database connection parameters
DB_HOST="${DATABASE_HOST:-localhost}"
DB_PORT="${DATABASE_PORT:-5432}"
DB_NAME="${DATABASE_NAME:-proof_arrive}"
DB_USER="${DATABASE_USERNAME:-postgres}"
DB_PASSWORD="${DATABASE_PASSWORD:-postgres}"

echo "Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
echo "User: ${DB_USER}"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo -e "${RED}Error: psql command not found. Please install PostgreSQL client.${NC}"
    exit 1
fi

# Export password for psql
export PGPASSWORD="${DB_PASSWORD}"

# Run the SQL fix script
echo -e "${YELLOW}Running SQL fix script...${NC}"
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f scripts/fix-multiple-users-same-accountid.sql

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ SQL fix script completed successfully${NC}"
else
    echo ""
    echo -e "${RED}✗ SQL fix script failed${NC}"
    exit 1
fi

# Verify the fix
echo ""
echo -e "${YELLOW}Verifying fix...${NC}"
echo ""

# Check for unique constraints on account_id
CONSTRAINT_CHECK=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "
SELECT COUNT(*) 
FROM pg_constraint 
WHERE conrelid = 'users'::regclass 
AND contype = 'u' 
AND pg_get_constraintdef(oid) LIKE '%account_id%'
AND pg_get_constraintdef(oid) NOT LIKE '%accid%'
AND pg_get_constraintdef(oid) NOT LIKE '%,%';
")

if [ "$CONSTRAINT_CHECK" -eq 0 ]; then
    echo -e "${GREEN}✓ No unique constraint on account_id alone${NC}"
else
    echo -e "${RED}✗ WARNING: Unique constraint still exists on account_id${NC}"
    echo "Run the SQL script again or check manually"
fi

# Check for unique indexes on account_id
INDEX_CHECK=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "
SELECT COUNT(*) 
FROM pg_indexes 
WHERE tablename = 'users' 
AND indexdef LIKE '%UNIQUE%'
AND indexdef LIKE '%account_id%'
AND indexdef NOT LIKE '%accid%'
AND indexdef NOT LIKE '%,%';
")

if [ "$INDEX_CHECK" -eq 0 ]; then
    echo -e "${GREEN}✓ No unique index on account_id alone${NC}"
else
    echo -e "${RED}✗ WARNING: Unique index still exists on account_id${NC}"
    echo "Run the SQL script again or check manually"
fi

# Show current users with same accountId
echo ""
echo -e "${YELLOW}Current users with same accountId:${NC}"
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "
SELECT 
    account_id,
    COUNT(*) as user_count,
    array_agg(accid ORDER BY accid) as accids
FROM users
WHERE account_id IS NOT NULL
GROUP BY account_id
HAVING COUNT(*) > 1
ORDER BY account_id
LIMIT 10;
"

echo ""
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}Fix completed!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo "Note: If you still cannot create multiple users with the same accountId,"
echo "      check the application code logic in users-sync.service.ts"
echo "      The code currently derives accountId from accid: accountId = Number(accid)"
echo "      To have multiple users with the same accountId, you need different accid values"
echo "      that map to the same accountId number, or modify the code to allow manual accountId assignment."
