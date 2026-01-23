# QR Code Encryption

The QR codes generated for vehicles are now encrypted using AES-256-GCM encryption for security.

## Environment Variable

Add the following to your `.env` file:

```bash
QR_CODE_ENCRYPTION_KEY=your-secret-encryption-key-minimum-32-characters-long
```

**Important**: 
- The key must be at least 32 characters long
- Use a strong, random key in production
- Keep this key secret and never commit it to version control
- If you change the key, all existing QR codes will need to be regenerated

## How It Works

1. **Generation**: When a QR code is generated:
   - The vehicleId is encrypted using AES-256-GCM
   - The encrypted value is stored in the database
   - The QR code image contains the **plain text** vehicleId (for scanning)

2. **Storage**: The database stores the encrypted QR code string in the format: `iv:tag:encryptedData`

3. **Validation**: When a QR code is scanned:
   - The scanned plain text vehicleId is encrypted
   - The encrypted value is matched against the stored encrypted value
   - This ensures only valid QR codes can be validated

## Security Benefits

- **Database Security**: Even if someone gains access to the database, they cannot easily extract vehicle IDs from the encrypted QR codes
- **Tamper Protection**: AES-GCM provides authentication, preventing tampering
- **Unique Encryption**: Each QR code uses a unique IV (Initialization Vector), so identical vehicle IDs produce different encrypted values

## Backward Compatibility

The system supports legacy unencrypted QR codes:
- When an unencrypted QR code is found, it's automatically upgraded to encrypted format
- This ensures a smooth transition without breaking existing QR codes

## Generating a Secure Key

You can generate a secure random key using:

```bash
# Using OpenSSL
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Migration Notes

If you have existing QR codes in the database:
- They will continue to work (backward compatibility)
- They will be automatically encrypted when accessed
- You can regenerate all QR codes to ensure they're encrypted
