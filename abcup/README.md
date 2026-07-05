# CattySMS PHP Stubs API - Backup

This directory contains a complete backup of the PHP Stubs API component of CattySMS Gateway.

## Purpose

The PHP Stubs API provides the external SMS activation service interface that external services use to:
- Request phone numbers (`getNumber`)
- Check for SMS/OTP codes (`getStatus`)
- Cancel activations (`setStatus`)
- Multi-use services support (`setStatus=3`)

## Files

| File | Purpose |
|------|---------|
| `handler_api.php` | Main API endpoint with cooldown logic, smart number allocation |
| `composer.json` | PHP dependencies configuration |
| `composer.lock` | Locked dependency versions |
| `vendor/` | Installed PHP packages (mongodb/mongodb) |
| `test_*.php` | Test files for API endpoints |

## Deployment Location

**Production Path**: `/var/www/html/stubs/`

## Dependencies

```bash
cd /var/www/html/stubs
composer install
```

Required: `mongodb/mongodb` PHP library

## Nginx Configuration

The stubs API is served via nginx at `/stubs/` location:

```nginx
location /stubs/ {
    alias /var/www/html/stubs/;
    location ~ \.php$ {
        if (!-f $request_filename) { return 404; }
        include fastcgi_params;
        fastcgi_pass unix:/run/php/php8.1-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $request_filename;
        fastcgi_buffer_size 16k;
        fastcgi_buffers 16 16k;
        fastcgi_read_timeout 60s;
    }
}
```

## API Endpoints

All endpoints use GET parameters:

### `getNumber` - Allocate a phone number
```
GET ?action=getNumber&api_key=KEY&service=SERVICE&country=COUNTRY
```
Returns: `ACCESS_NUMBER:{orderId}:{dialCode}{number}` or error code

### `getStatus` - Check for SMS/OTP
```
GET ?action=getStatus&api_key=KEY&id={orderId}
```
Returns: `STATUS_OK:{otp}` or `STATUS_WAIT_CODE` or `STATUS_CANCEL`

### `setStatus` - Cancel or finalize
```
GET ?action=setStatus&api_key=KEY&id={orderId}&status=8
```
Status codes:
- `8` - Cancel activation
- `3` - Request next SMS (multi-use services)

## Number Allocation Logic

The `getNumber` action uses smart number selection:

1. Random sampling using MongoDB `$sample`
2. Lock check - skips numbers locked for this service/country
3. Active order check - skips numbers with active orders for same service
4. Recent usage check - skips numbers used in last 4 hours for same service
5. Cooldown check - skips numbers used recently (5-20 min randomized)
6. Max retries - attempts up to 6 times before returning `NO_NUMBER`

## Database Collections Used

- `orders` - SMS activation orders
- `numbers` - Available phone numbers
- `services` - Supported services with OTP patterns
- `countires` - [sic] Supported countries
- `users` - API users with keys
- `locks` - Number locks per service/country

## Security

- IP whitelist: Only allows requests from `184.107.141.14`
- API key authentication required for all actions
- MongoDB connection via environment variables

## Environment Variables

Required:
- `MONGODB_URI` - MongoDB connection string
- `MONGODB_DATABASE` - Database name (default: `sunmine`)

## IP Whitelist

Current allowed IPs in `handler_api.php`:
```php
$allowed_ips = [
    '184.107.141.14',
];
```

To add more IPs, modify the `$allowed_ips` array.

## Testing

Test files included:
- `test_api.php` - General API test
- `test_buynumber.php` - Test number allocation
- `test_getsms.php` - Test SMS retrieval

## Version History

- **Current** - Production version with cooldown logic (5-20 min randomized)
- Features: smart number allocation, early cancel protection (2 min), comprehensive validation
