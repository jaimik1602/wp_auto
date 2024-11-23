const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Configuration
const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0/469434999592396/messages';
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PORT = process.env.PORT || 3000;

// In-memory storage for user states
const userStates = {};

// Routes
app.post('/webhook', async (req, res) => {
    const messages = req.body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages || messages.length === 0) return res.sendStatus(200);

    const message = messages[0];
    const from = message.from;
    const text = message.text?.body?.trim();
    console.log(`Message from ${from}: ${text}`);

    // Initialize or retrieve user state
    if (!userStates[from]) userStates[from] = { step: 0 };
    const userState = userStates[from];

    try {
        switch (userState.step) {
            case 0: // Initial greeting
                if (text.toLowerCase() === 'hi') {
                    await sendWhatsAppMessage(from, 'Please enter your vehicle number.');
                    userState.step = 1;
                } else {
                    await resetUserState(from, 'Please start by saying "Hi".');
                }
                break;

            case 1: // Handle vehicle number
                userState.vehicleNumber = text;
                const response = await fetchVehicle(text);
                if (!response.success) {
                    await sendWhatsAppMessage(from, response.message);
                } else {
                    const vehicleData = response.data[0];
                    userState.imei = vehicleData.deviceid;
                    await sendInteractiveMessage(
                        from,
                        `Welcome Back - ${text}\nSub Agency - ${vehicleData.subagency}\nIMEI - ${vehicleData.deviceid}\nLast Update - ${vehicleData.received_Date}`,
                        [
                            { id: 'update_device', title: 'Update From Device' },
                            { id: 'update_link', title: 'Update From Link' },
                        ]
                    );
                    userState.step = 2;
                }
                break;

            case 2: // Handle button click
                const buttonId = message?.interactive?.button_reply?.id;
                if (buttonId === 'update_device') {
                    await sendLocationRequest(from);
                    userState.step = 3;
                } else if (buttonId === 'update_link') {
                    await sendWhatsAppMessage(from, 'Please share your Google Maps link.');
                    userState.step = 4;
                } else {
                    await resetUserState(from, 'Invalid action. Please start again by saying "Hi".');
                }
                break;

            case 3: // Handle location sharing
                if (message.location) {
                    const { latitude, longitude } = message.location;
                    userState.latitude = latitude;
                    userState.longitude = longitude;
                    await submitComplaint(from, userState);
                    delete userStates[from];
                } else {
                    await sendWhatsAppMessage(from, 'Please share your location using the attachment icon.');
                }
                break;

            case 4: // Handle Google Maps link
                const googleMapsRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
                const match = text.match(googleMapsRegex);
                if (match) {
                    const [_, latitude, longitude] = match;
                    userState.latitude = latitude;
                    userState.longitude = longitude;
                    await submitComplaint(from, userState);
                    delete userStates[from];
                } else {
                    await sendWhatsAppMessage(from, 'Invalid Google Maps link. Please try again.');
                }
                break;

            default:
                await resetUserState(from, 'Something went wrong. Please start again by saying "Hi".');
                break;
        }
    } catch (error) {
        console.error('Error:', error.message);
        await sendWhatsAppMessage(from, 'An error occurred. Please try again later.');
    }

    res.sendStatus(200);
});

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified!');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Utility functions
async function sendWhatsAppMessage(to, text) {
    await axios.post(
        WHATSAPP_API_URL,
        { messaging_product: 'whatsapp', to, text: { body: text } },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

async function sendInteractiveMessage(to, text, buttons) {
    const buttonList = buttons.map((btn) => ({
        type: 'reply',
        reply: { id: btn.id, title: btn.title },
    }));
    await axios.post(
        WHATSAPP_API_URL,
        {
            messaging_product: 'whatsapp',
            to,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text },
                action: { buttons: buttonList },
            },
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

async function sendLocationRequest(to) {
    await sendWhatsAppMessage(to, 'Please share your location using the attachment icon in WhatsApp.');
}

async function fetchVehicle(vehicleNumber) {
    try {
        const response = await axios.get(`https://app.jaimik.com/wp_api/wp_check.php?vehicleNumber=${vehicleNumber}`);
        return response.data.length > 0
            ? { success: true, data: response.data }
            : { success: false, message: 'Vehicle details not found. Please check the number and try again.' };
    } catch (error) {
        console.error('Error fetching vehicle:', error.message);
        return { success: false, message: 'Failed to fetch vehicle information. Please try again later.' };
    }
}

async function submitComplaint(from, { vehicleNumber, imei, latitude, longitude }) {
    try {
        const response = await axios.get(
            `https://app.jaimik.com/wp_api/wp_push.php?vehicleNumber=${vehicleNumber}&imei=${imei}&lat=${latitude}&long=${longitude}`
        );
        const message =
            response.data.msg === 'success'
                ? 'Complaint submitted successfully.'
                : 'Complaint submission failed.';
        await sendWhatsAppMessage(from, message);
    } catch (error) {
        console.error('Error submitting complaint:', error.message);
        await sendWhatsAppMessage(from, 'An error occurred while submitting your complaint.');
    }
}

async function resetUserState(to, message) {
    await sendWhatsAppMessage(to, message);
    delete userStates[to];
}

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
