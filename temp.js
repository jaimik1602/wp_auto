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
            return { success: true, data: response.data };
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