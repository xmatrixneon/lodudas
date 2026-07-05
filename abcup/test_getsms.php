<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require '/var/www/html/stubs/vendor/autoload.php';

use MongoDB\Client;
use MongoDB\BSON\ObjectId;

// Test setup - MUST set all these BEFORE including handler_api.php
$_SERVER['HTTP_CF_CONNECTING_IP'] = '184.107.141.14';
$_SERVER['HTTP_AUTHORIZATION'] = 'Bearer 29875f8512b511597e1b96a6af723de7d65c2dd549245ba56946bef1f78c5ade';
$_POST['action'] = 'getStatus';
$_POST['api_key'] = '29875f8512b511597e1b96a6af723de7d65c2dd549245ba56946bef1f78c5ade';
$_POST['id'] = '6a36b4544b34a933172897fd';
$_REQUEST['action'] = 'getStatus';
$_SERVER['REQUEST_METHOD'] = 'POST';

echo "Testing getStatus (getsms)...\n";
echo "ID: " . $_POST['id'] . "\n";
echo "API Key: " . $_POST['api_key'] . "\n";
echo "Auth Header: " . ($_SERVER['HTTP_AUTHORIZATION'] ?? 'NOT SET') . "\n";

// Now include handler - it will process the request
ob_start();
require '/var/www/html/stubs/handler_api.php';
$result = ob_get_clean();

echo "\n=== RESULT ===\n";
echo var_export($result, true);
echo "\n=== END ===\n";
