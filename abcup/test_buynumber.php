<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    echo "ERROR [$errno]: $errstr in $errfile:$errline\n";
    return true;
});
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null) {
        echo "\n=== FATAL ERROR ===\n";
        echo "Type: " . $error['type'] . "\n";
        echo "Message: " . $error['message'] . "\n";
        echo "File: " . $error['file'] . ":" . $error['line'] . "\n";
    }
});

// Temporarily modify IP check for testing
$_SERVER['HTTP_CF_CONNECTING_IP'] = '184.107.141.14';

// Set POST params (getRequestData uses POST)
$_POST['action'] = 'getNumber';
$_POST['api_key'] = '29875f8512b511597e1b96a6af723de7d65c2dd549245ba56946bef1f78c5ade';
$_POST['service'] = 'snapmint';
$_POST['country'] = '22';

// Also set REQUEST for action check at the end
$_REQUEST['action'] = 'getNumber';

echo "Starting buynumber test...\n";
echo "IP: " . $_SERVER['HTTP_CF_CONNECTING_IP'] . "\n";
echo "Action: " . $_REQUEST['action'] . "\n";

// Set request method
$_SERVER['REQUEST_METHOD'] = 'POST';

// Output buffer to catch result
ob_start();
require '/var/www/html/stubs/handler_api.php';
$result = ob_get_clean();

echo "\n=== RESULT ===\n";
echo var_export($result, true);
echo "\n=== END ===\n";
