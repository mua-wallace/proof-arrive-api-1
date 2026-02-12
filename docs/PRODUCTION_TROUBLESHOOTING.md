# Production Deployment Troubleshooting

This guide helps diagnose and fix issues when the application works in development but fails in production.

## Quick Diagnostics

### 1. Test Database Connection

```bash
docker exec -it proof-arrive-api node scripts/test-db-connection.js
```

This will show:
- Connection status
- Database configuration
- Common error codes and solutions

### 2. Check Environment Variables

```bash
docker exec -it proof-arrive-api env | grep DATABASE
```

Verify all required variables are set:
- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_USERNAME`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`

### 3. Check Container Logs

```bash
docker logs proof-arrive-api --tail 100
```

Look for:
- Database connection errors
- Migration errors
- Missing environment variables

## Common Issues

### Issue 1: Connection Refused (ECONNREFUSED)

**Symptoms:**
- Error: `ECONNREFUSED` or `Connection refused`
- Application fails to start or login fails

**Causes:**
1. Database host is incorrect
2. Database port is wrong
3. Database server is not running
4. Firewall blocking connection
5. Network configuration issue

**Solutions:**

1. **Verify database host:**
   ```bash
   # In production, DATABASE_HOST might be a service name or IP
   # Check your docker-compose.yml or deployment config
   docker exec -it proof-arrive-api ping -c 3 $DATABASE_HOST
   ```

2. **Check network connectivity:**
   ```bash
   # Test if port is accessible
   docker exec -it proof-arrive-api nc -zv $DATABASE_HOST $DATABASE_PORT
   ```

3. **Verify database is running:**
   ```bash
   # If using docker-compose, check postgres service
   docker ps | grep postgres
   ```

4. **Check network configuration:**
   - Ensure both containers are on the same network (`global-network`)
   - Verify network is external: `docker network ls | grep global-network`

### Issue 2: Authentication Failed (28P01)

**Symptoms:**
- Error: `password authentication failed` or `28P01`
- Connection test fails

**Solutions:**

1. **Verify credentials:**
   ```bash
   docker exec -it proof-arrive-api node scripts/test-db-connection.js
   ```

2. **Check password encoding:**
   - Ensure password doesn't contain special characters that need URL encoding
   - If password has `@`, `:`, `/`, etc., they need to be URL-encoded in connection string

3. **Reset database password:**
   ```bash
   # If you have access to postgres container
   docker exec -it postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'newpassword';"
   ```

### Issue 3: Database Does Not Exist (3D000)

**Symptoms:**
- Error: `database "proof_arrive" does not exist` or `3D000`

**Solutions:**

1. **Create database:**
   ```bash
   docker exec -it postgres psql -U postgres -c "CREATE DATABASE proof_arrive_db;"
   ```

2. **Verify DATABASE_NAME matches:**
   ```bash
   docker exec -it proof-arrive-api env | grep DATABASE_NAME
   ```

### Issue 4: Missing Environment Variables

**Symptoms:**
- Logs show: `DATABASE_HOST: NOT SET`
- Migrations skipped
- Application starts but queries fail

**Solutions:**

1. **Check docker-compose.yml:**
   - Ensure all variables are listed in `environment:` section
   - Variables must be explicitly listed (not loaded from .env file in production)

2. **Verify .env file (if using):**
   ```bash
   # In production, ensure .env file exists or use environment variables
   docker exec -it proof-arrive-api cat .env | grep DATABASE
   ```

3. **Set variables in Portainer/Docker:**
   - Go to container settings
   - Add environment variables
   - Restart container

### Issue 5: Network Timeout (ETIMEDOUT)

**Symptoms:**
- Error: `ETIMEDOUT` or connection timeout
- Slow or hanging connections

**Solutions:**

1. **Increase timeout:**
   - Connection timeout is set to 10 seconds in `database.module.ts`
   - For slow networks, you may need to increase this

2. **Check database load:**
   ```bash
   # Check if database is overloaded
   docker exec -it postgres psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
   ```

3. **Verify network performance:**
   ```bash
   docker exec -it proof-arrive-api ping -c 5 $DATABASE_HOST
   ```

### Issue 6: SSL Connection Required

**Symptoms:**
- Error: `SSL connection is required` or `no pg_hba.conf entry`

**Solutions:**

1. **Enable SSL in connection:**
   ```bash
   # Set environment variable
   DATABASE_SSL=true
   ```

2. **Or disable SSL requirement in PostgreSQL:**
   ```bash
   # Edit postgresql.conf (if you have access)
   # Set: ssl = off
   ```

## Differences: Dev vs Production

### Development (docker-compose-dev.yml)
- Uses `env_file: - .env` (loads all variables)
- Has local postgres service
- Uses `depends_on` with healthcheck
- Uses bridge network

### Production (docker-compose.yml)
- Uses explicit `environment:` variables
- External database (no postgres service)
- No `depends_on` (database is external)
- Uses external network (`global-network`)

## Verification Checklist

Before deploying, verify:

- [ ] All environment variables are set in production
- [ ] Database host is correct (service name or IP)
- [ ] Database port is accessible
- [ ] Database credentials are correct
- [ ] Network configuration is correct
- [ ] Database exists and is accessible
- [ ] Migrations can run successfully
- [ ] Container can connect to database

## Testing Connection

Run these commands in order:

```bash
# 1. Test basic connectivity
docker exec -it proof-arrive-api ping -c 3 $DATABASE_HOST

# 2. Test port accessibility
docker exec -it proof-arrive-api nc -zv $DATABASE_HOST $DATABASE_PORT

# 3. Test database connection
docker exec -it proof-arrive-api node scripts/test-db-connection.js

# 4. Check migrations
docker exec -it proof-arrive-api node scripts/check-users-table-schema.js

# 5. Test login (if API is running)
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
```

## Getting Help

If issues persist:

1. **Collect logs:**
   ```bash
   docker logs proof-arrive-api > app.log 2>&1
   ```

2. **Run diagnostics:**
   ```bash
   docker exec -it proof-arrive-api node scripts/test-db-connection.js > db-test.log 2>&1
   ```

3. **Check environment:**
   ```bash
   docker exec -it proof-arrive-api env > env.log 2>&1
   ```

4. Share the logs and error messages for further assistance.
