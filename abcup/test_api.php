<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Set up the request environment
$_SERVER['REQUEST_METHOD'] = 'POST';
$_SERVER['HTTP_CF_CONNECTING_IP'] = '184.107.141.14';
$_REQUEST['action'] = 'getNumber';
$_REQUEST['api_key'] = '29875f8512b511597e1b96a6af723de7d65c2dd549245ba56946bef1f78c5ade';
$_REQUEST['service'] = 'snapmint';
$_REQUEST['country'] = '22';

// Include the handler
include '/var/www/html/stubs/handler_api.php';
