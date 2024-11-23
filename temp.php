<?php

require "../db.php";

error_reporting(E_ALL);
ini_set('display_errors', 1);

// Get vehicle number from URL
$vehicleNumber = isset($_GET['vehicleNumber']) ? $_GET['vehicleNumber'] : null;

// Validate input
if (empty($vehicleNumber)) {
    echo json_encode([
        "status" => "error",
        "message" => "Vehicle number is required."
    ]);
    exit;
}

// Initialize cURL
$ch = curl_init();

// API URL
$url = "https://vtmscgm.gujarat.gov.in/OpenVehicleStatus/GetOpenVehicleStatus?vehiclenumber=" . $vehicleNumber;

curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

// // Execute cURL
$resp = curl_exec($ch);

// // Check for cURL errors
if ($e = curl_error($ch)) {
    echo json_encode([
        "status" => "error",
        "message" => "cURL error: " . $e
    ]);
    exit;
}


// Decode JSON response
$responseData = json_decode($resp, true);

if ($responseData[0]['vehicleregno'] == "N.A") {
    $sql = "SELECT * FROM mh_data WHERE vehicle_number = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("s", $vehicleNumber);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows > 0) {
        $row = $result->fetch_assoc();
        $imei = $row['imei'];
    }

    $responseData[0]['deviceid'] = $imei;
    $responseData[0]['vehicleregno'] = $vehicleNumber;
    // Return the vehicle status data

    echo json_encode($responseData);
} else {
    echo json_encode($responseData);
}

// Close cURL
curl_close($ch);
?>