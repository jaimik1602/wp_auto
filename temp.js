const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

async function fetchVehicleInfo() {
    const vehicleNumber = "GJ26T4546";
    const url = `https://vtmscgm.gujarat.gov.in/OpenVehicleStatus/GetOpenVehicleStatus?vehiclenumber=${vehicleNumber}`;

    // Set up proxy configuration directly in axios request
    const proxyConfig = {
        host: '103.69.243.162',  // Replace with your proxy server hostname
        port: 43826,            // Replace with your proxy server port
        protocol: 'http',      // Set the protocol ('http' or 'https')
    };

    try {
        const response = await axios.get(url, {
            proxy: proxyConfig  // Use proxy configuration directly in axios
        });
        
        if (response.data && response.data.length > 0) {
            const temp = response.data[0];
            return { success: true, data: temp };
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
        } else {
            return { success: false, message: `Unexpected Error: ${error.message}.` };
        }
    }
}

async function temp() {
    const result = await fetchVehicleInfo();
    console.log(result);
}

temp();
