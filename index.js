const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Environment variables
const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0/469434999592396/messages';
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Temporary user states storage
const userStates = {};

// Webhook verification endpoint
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

// Webhook to handle incoming messages
app.post('/webhook', async (req, res) => {
    try {
        const messages = req.body.entry[0].changes[0].value.messages;

        if (!messages || messages.length === 0) {
            return res.sendStatus(200);
        }

        const message = messages[0];
        const from = message.from; // User's phone number
        const text = message.text?.body?.trim(); // User's message content
        console.log(`Received message: "${text}" from: ${from}`);

        // Initialize user state if not present
        if (!userStates[from]) {
            userStates[from] = { step: 0 };
        }

        const userState = userStates[from];

        switch (userState.step) {
            case 0:
                if (text.toLowerCase() === 'hi') {
                    await sendWhatsAppMessage(from, 'Please enter your vehicle number.');
                    userState.step = 1;
                }
                break;

            case 1:
                userState.vehicleNumber = text;
                const response = await fetchVehicle(text);
                if (response.success) {
                    const vehicleData = response.data[0];
                    userState.imei = vehicleData.deviceid;

                    await sendInteractiveMessage(
                        from,
                        `Welcome Back - ${text}\nSub Agency - ${vehicleData.subagency}\nIMEI - ${vehicleData.deviceid}\nLast Update - ${vehicleData.received_Date}`,
                        [
                            { id: 'update_device', title: 'Update From Device' },
                            { id: 'update_link', title: 'Update From Link' }
                        ]
                    );
                    userState.step = 2;
                } else {
                    await sendWhatsAppMessage(from, 'Vehicle details not found.');
                }
                break;

            case 2:
                const buttonId = message.interactive?.button_reply?.id;
                if (buttonId === 'update_device') {
                    await sendLocationRequest(from);
                    userState.step = 3;
                } else if (buttonId === 'update_link') {
                    await sendWhatsAppMessage(from, 'Please share your Google Maps link.');
                    userState.step = 4;
                }
                break;

            case 3:
                if (message.location) {
                    const { latitude, longitude } = message.location;
                    userState.latitude = latitude;
                    userState.longitude = longitude;

                    await submitComplaint(from, userState);
                    delete userStates[from]; // Reset user state after completion
                } else {
                    await sendWhatsAppMessage(from, 'Please share your location using the attachment icon.');
                }
                break;

            case 4:
                const locationData = parseGoogleMapsLink(text);
                if (locationData) {
                    userState.latitude = locationData.latitude;
                    userState.longitude = locationData.longitude;

                    await submitComplaint(from, userState);
                    delete userStates[from];
                } else {
                    await sendWhatsAppMessage(from, 'Invalid Google Maps link. Please try again.');
                }
                break;

            default:
                await sendWhatsAppMessage(from, 'Sorry, I didn\'t understand that. Please start again by saying "Hi".');
                delete userStates[from];
        }
    } catch (error) {
        console.error('Error handling webhook:', error.message);
    }

    res.sendStatus(200);
});

// Helper functions
async function sendWhatsAppMessage(to, text) {
    await axios.post(
        WHATSAPP_API_URL,
        {
            messaging_product: 'whatsapp',
            to,
            text: { body: text }
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

async function sendInteractiveMessage(to, text, buttons) {
    await axios.post(
        WHATSAPP_API_URL,
        {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text },
                action: { buttons }
            }
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

async function sendLocationRequest(to) {
    await axios.post(
        WHATSAPP_API_URL,
        {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'interactive',
            interactive: {
                type: 'location_request_message',
                body: {
                    text: 'Please share your current location using the attachment icon in WhatsApp.'
                },
                action: { name: 'send_location' }
            }
        },
        { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
}

async function fetchVehicle(vehicleNumber) {
    try {
        const response = await axios.get(
            `https://app.jaimik.com/wp_api/wp_check.php?vehicleNumber=${vehicleNumber}`
        );
        if (response.data && response.data.length > 0) {
            return { success: true, data: response.data };
        } else {
            return { success: false, message: 'No data found for this vehicle number.' };
        }
    } catch (error) {
        console.error('Error fetching vehicle data:', error.message);
        return { success: false, message: 'An error occurred while fetching vehicle data.' };
    }
}

async function submitComplaint(from, userState) {
    try {
        const url = `https://app.jaimik.com/wp_api/wp_push.php?vehicleNumber=${userState.vehicleNumber}&imei=${userState.imei}&lat=${userState.latitude}&long=${userState.longitude}`;
        const response = await axios.get(url);
        if (response.data.msg === 'success') {
            await sendWhatsAppMessage(from, 'Complaint submitted successfully.');
        } else {
            await sendWhatsAppMessage(from, 'Complaint submission failed.');
        }
    } catch (error) {
        console.error('Error submitting complaint:', error.message);
        await sendWhatsAppMessage(from, 'An error occurred while submitting your complaint.');
    }
}

function parseGoogleMapsLink(text) {
    const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = text.match(regex);
    if (match) {
        return { latitude: match[1], longitude: match[2] };
    }
    return null;
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
