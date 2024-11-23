const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Replace with your credentials
const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0/469434999592396/messages';
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

// Store user states temporarily
const userStates = {};

app.post('/webhook', async (req, res) => {
    const messages = req.body.entry[0].changes[0].value.messages;

    if (!messages || messages.length === 0) return res.sendStatus(200);

    const message = messages[0];
    const from = message.from; // User's phone number
    const text = message.text?.body?.trim(); // User's message content
    console.log(text);

    // Initialize user state if not already
    if (!userStates[from]) {
        userStates[from] = { step: 0 };
    }

    const userState = userStates[from];

    try {
        if (userState.step === 0 && text.toLowerCase() == 'hi') {
            await sendWhatsAppMessage(from, 'Please enter your vehicle number.');
            userState.step = 1;
        } else if (userState.step === 1) {
            userState.vehicleNumber = text;
            var response = await fetchVehicle(text);
            userState.imei = response.data[0]['deviceid'];
            if (!response.data || !response.data[0]) {
                await sendInteractiveMessage(from, 'Vehicle details not found.');
            } else {
                console.log(userState.imei);
                await sendInteractiveMessage(from, `Welcome Back - ${text} \nSub Agency - ${response.data[0]['subagency']}\nIMEI - ${response.data[0]['deviceid']}\nLast Update - ${response.data[0]['received_Date']}`, [{ id: 'update_device', title: 'Update From Device' }, { id: 'update_link', title: 'Update From Link' }]);
            }
            userState.step = 2;
        } else if (userState.step === 2) {
            if (message.interactive?.button_reply?.id === 'update_device') {
                // Proceed with the "Update From Device" flow
                await sendLocationRequest(from);
                userState.step = 3;
            } else if (message.interactive?.button_reply?.id === 'update_link') {
                // Ask for a Google Maps link
                await sendWhatsAppMessage(from, 'Please share your Google Maps link.');
                userState.step = 4;
            }
        } else if (userState.step === 4) {
            // Handle Google Maps link input
            const googleMapsRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
            const match = text.match(googleMapsRegex);
            if (match) {
                const latitude = match[1];
                const longitude = match[2];
                userState.latitude = latitude;
                userState.longitude = longitude;

                // Proceed with the complaint submission
                await submitComplaint(from, userState);
                delete userStates[from]; // Reset state after successful submission
            } else {
                await sendWhatsAppMessage(from, 'Invalid Google Maps link. Please try again.');
            }
        } else if (userState.step === 3) {
            // Handle location sharing (existing flow)
            if (message.location) {
                const { latitude, longitude } = message.location;
                userState.latitude = latitude;
                userState.longitude = longitude;

                // Proceed with the complaint submission
                await submitComplaint(from, userState);
                delete userStates[from]; // Reset state after successful submission
            } else {
                await sendWhatsAppMessage(from, 'Please share your location using the attachment icon.');
            }
        } else {
            await sendWhatsAppMessage(from, 'Sorry, I didn\'t understand that. Please start again by saying "Hi".');
            delete userStates[from]; // Reset user state for invalid input
        }
    } catch (error) {
        console.error('Error:', error);
    }

    res.sendStatus(200);
});

// Function to send plain text messages
async function sendWhatsAppMessage(to, text) {
    await axios.post(
        WHATSAPP_API_URL,
        {
            messaging_product: 'whatsapp',
            to,
            text: { body: text },
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

async function fetchVehicle(vehicleNumber, retries = 3) {
    const url = `https://app.jaimik.com/wp_api/wp_check.php?vehicleNumber=${vehicleNumber}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
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
            if (error.code === 'EAI_AGAIN' && attempt < retries) {
                console.log(`Retrying... Attempt ${attempt}/${retries}`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retrying
            } else if (error.response) {
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
            } else {
                return { success: false, message: `Unexpected Error: ${error.message}.` };
            }
        }
    }

    return {
        success: false,
        message: 'Failed to fetch vehicle information after multiple attempts.',
    };
}

// Function to send interactive button messages
async function sendInteractiveMessage(to, text, buttonList) {
    await axios.post(
        WHATSAPP_API_URL,
        {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            type: 'interactive',
            to,
            interactive: {
                type: 'button',
                body: { text },
                action: { buttons: buttonList },
            },
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

// Function to request location sharing
async function sendLocationRequest(to) {
    // Function to request location sharing with an interactive button
    await axios.post(
        WHATSAPP_API_URL,
        {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            type: 'interactive',
            to,
            interactive: {
                type: 'location_request_message',
                body: {
                    text: 'Please share your current location by using the attachment icon in WhatsApp and selecting "Location".',
                },
                action: {
                    name: 'send_location',
                }
            },
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

async function submitComplaint(from, userState) {
    const url = `https://app.jaimik.com/wp_api/wp_push.php?vehicleNumber=${userState.vehicleNumber}&imei=${userState.imei}&lat=${userState.latitude}&long=${userState.longitude}`;
    try {
        const response = await axios.get(url, { timeout: 7000 });
        if (response.data['msg'] === 'success') {
            await sendWhatsAppMessage(from, 'Complaint submitted successfully.');
        } else {
            await sendWhatsAppMessage(from, 'Complaint submission unsuccessful.');
        }
    } catch (error) {
        console.error('Error submitting complaint:', error.message);
        await sendWhatsAppMessage(from, 'An error occurred while submitting your complaint.');
    }
}


// Webhook verification endpoint
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        console.log('Webhook verified!');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
