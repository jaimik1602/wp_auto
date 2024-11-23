<?php

// Extract the parameters from the URL
if (isset($_GET['vehicleNumber']) && isset($_GET['lat']) && isset($_GET['long'])) {
    $vehicleNumber = $_GET['vehicleNumber'];
    $deviceid = $_GET['imei'];
    $latitude = $_GET['lat'];
    $longitude = $_GET['long'];
} else {
    die("Error: Missing required parameters (vehicleNumber, imei, lat, long).");
}


date_default_timezone_set('Asia/Kolkata');
$currentDate = date("dmY");   // Date in DDMMYYYY format

// Get GMT Time (UTC)
date_default_timezone_set('UTC');
$currentTime = date("His");   // Time in HHMMSS format (GMT)


// Create the data string
$dataString = "\$NRM,WTEX,1.ONTC,NR,01,L,{$deviceid},{$vehicleNumber},1,{$currentDate},{$currentTime},{$latitude},N,{$longitude},E,0.0,229.84,27,0114.04,2.00,0.41,Vodafone,0,1,25.4,4.0,0,C,22,404,05,16c5,895b,16,16c5,8959,15,16c5,8aff,15,16c5,8afe,10,16c5,895a,0000,00,047834,5400.000,0.000,1450.092,()*D4";

// Send the data string to a server
$serverIP = "103.234.162.150";  // Replace with actual destination IP
$serverPort = 5001;         // Replace with actual destination port

// Send the data to the server via socket
$socket = fsockopen($serverIP, $serverPort, $errno, $errstr, 30);
if (!$socket) {
    echo "Error: $errstr ($errno)\n";
} else {
    fwrite($socket, $dataString);  // Send the data
    fclose($socket);  // Close the connection
    echo "Data sent successfully to {$serverIP}:{$serverPort}\n";
}

// For debugging purposes, you can output the string
echo $dataString;

?>