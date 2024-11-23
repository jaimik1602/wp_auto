const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const net = require('net');
const { TIMEOUT } = require('dns');
require('dotenv').config();

async function fetchVehicleInfo() {
    vehicleNumber = "GJ26T4546";
    const url = `https://vtmscgm.gujarat.gov.in/OpenVehicleStatus/GetOpenVehicleStatus?vehiclenumber=${vehicleNumber}`;
    try {
        const response = await axios.get(url);
        if (response.data && response.data.length > 0) {
            var temp = response.data[0];
            return { success: true, data: temp['agency'] };
        } else {
            return {
                success: false,
                message: 'No data found for this vehicle number. Please check the number and try again.',
            };
        }
    } catch (error) {
        if (error.response) {
            return {
                success: false,
                message: `Server Error: ${error.response.status} - ${error.response.statusText}.`,
            };
        } else if (error.request) {
            return {
                success: false,
                message: 'No response from the API. The server might be down or unreachable.',
            };
        } else if (error.code === 'ENOTFOUND') {
            return {
                success: false,
                message: 'DNS resolution failed. Please check the API domain or your network settings.',
            };
        } else if (error.code === 'EAI_AGAIN') {
            return {
                success: false,
                message: 'Temporary DNS resolution issue. Please try again later.',
            };
        } else {
            return { success: false, message: `Unexpected Error: ${error.message}.` };
        }
    }
}

async function temp(){
    const result = await fetchVehicleInfo();
    console.log(result);
}

temp();


// const axios = require('axios');

// async function fetchLatLong(shortUrl) {
//     try {
//         // Step 1: Resolve the shortened URL
//         const response = await axios.get(shortUrl, {
//             maxRedirects: 0,
//             validateStatus: (status) => status >= 200 && status < 400, // Accept redirects
//         });
        
//         // The resolved URL is in the `location` header
//         const resolvedUrl = response.headers.location;

//         if (!resolvedUrl) {
//             console.error("Unable to resolve the URL.");
//             return null;
//         }

//         // Step 2: Extract latitude and longitude from the resolved URL
//         // Example resolved URL: https://www.google.com/maps/@12.9715987,77.594566,15z
//         const latLongRegex = /@([-0-9.]+),([-0-9.]+),/;
//         const placeRegex = /place\/([-0-9.]+),([-0-9.]+)/;

//         let matches = resolvedUrl.match(latLongRegex) || resolvedUrl.match(placeRegex);

//         if (matches) {
//             const latitude = matches[1];
//             const longitude = matches[2];
//             return { latitude, longitude };
//         } else {
//             console.error("Coordinates not found in the resolved URL.");
//             return null;
//         }
//     } catch (error) {
//         if (error.response && error.response.status === 301) {
//             // Handle redirection manually
//             const resolvedUrl = error.response.headers.location;
//             return fetchLatLong(resolvedUrl); // Retry with resolved URL
//         }
//         console.error("Error fetching URL:", error.message);
//         return null;
//     }
// }

// // Test the function
// const shortUrl = "https://maps.app.goo.gl/32qPE8GzyfGvAJbB8";

// fetchLatLong(shortUrl).then((coordinates) => {
//     if (coordinates) {
//         console.log(`Latitude: ${coordinates.latitude}`);
//         console.log(`Longitude: ${coordinates.longitude}`);
//     } else {
//         console.log("Failed to fetch coordinates.");
//     }
// });
