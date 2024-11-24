const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0/469434999592396/messages';
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

// User sessions to manage chat state
const userSessions = {};

// Helper function to reset user state
function resetUserState(from) {
    userSessions[from] = {
        step: 0,
        vehicleAttempts: 0,
        locationAttempts: 0,
        sessionStartTime: Date.now(),
    };
}

// Middleware to validate session expiration
function validateSession(from) {
    if (!userSessions[from]) return false;
    const sessionDuration = (Date.now() - userSessions[from].sessionStartTime) / 1000 / 60; // in minutes
    return sessionDuration <= 5; // Session valid for 5 minutes
}

// Webhook endpoint
app.post('/webhook', async (req, res) => {
    const messages = req.body.entry[0].changes[0].value.messages;
    if (!messages || messages.length === 0) return res.sendStatus(200);

    const message = messages[0];
    const from = message.from;
    const text = message.text?.body?.trim();

    if (!validateSession(from)) {
        resetUserState(from);
        await sendWhatsAppMessage(from, "Your session has ended. Send 'Hi' to start the conversation.");
        return res.sendStatus(200);
    }

    if (!userSessions[from]) resetUserState(from);

    const userState = userSessions[from];

    try {
        if (userState.step === 0 && text.toLowerCase() === 'hi') {
            await sendWhatsAppMessage(from, 'Please enter your vehicle number.');
            userState.step = 1;
        } else if (userState.step === 1) {
            const response = await fetchVehicle(text);
            if (!response.success || !response.data[0]?.deviceid) {
                userState.vehicleAttempts += 1;
                if (userState.vehicleAttempts >= 3) {
                    resetUserState(from);
                    await sendWhatsAppMessage(from, "You have exceeded the allowed attempts. Send 'Hi' to start the conversation.");
                } else {
                    await sendWhatsAppMessage(from, `Vehicle details not found. Attempts left: ${3 - userState.vehicleAttempts}.`);
                }
            } else {
                userState.vehicleNumber = text;
                userState.imei = response.data[0].deviceid;
                await sendInteractiveMessage(from, `Vehicle Found - ${text}\nIMEI - ${response.data[0].deviceid}\nSub Agency - ${response.data[0].subagency}\nLast Update - ${response.data[0].received_Date}`, [
                    { id: 'update_device', title: 'Update From Device' },
                    { id: 'update_link', title: 'Update From Link' },
                ]);
                userState.step = 2;
            }
        } else if (userState.step === 2) {
            const buttonId = message.interactive?.button_reply?.id;
            if (buttonId === 'update_device') {
                await sendWhatsAppMessage(from, 'Please share your location using the attachment icon.');
                userState.step = 3;
            } else if (buttonId === 'update_link') {
                await sendWhatsAppMessage(from, 'Please forward your driver\'s location in the chat.');
                userState.step = 4;
            } else {
                userState.locationAttempts += 1;
                if (userState.locationAttempts >= 3) {
                    resetUserState(from);
                    await sendWhatsAppMessage(from, "You have exceeded the allowed attempts. Send 'Hi' to start the conversation.");
                } else {
                    await sendWhatsAppMessage(from, `Invalid option. Attempts left: ${3 - userState.locationAttempts}.`);
                }
            }
        } else if (userState.step === 3) {
            if (message.location) {
                const { latitude, longitude } = message.location;
                userState.latitude = latitude;
                userState.longitude = longitude;
                await submitComplaint(from, userState);
                resetUserState(from);
            } else {
                userState.locationAttempts += 1;
                if (userState.locationAttempts >= 3) {
                    resetUserState(from);
                    await sendWhatsAppMessage(from, "You have exceeded the allowed attempts. Send 'Hi' to start the conversation.");
                } else {
                    await sendWhatsAppMessage(from, `Please share a valid location. Attempts left: ${3 - userState.locationAttempts}.`);
                }
            }
        } else {
            resetUserState(from);
            await sendWhatsAppMessage(from, "Sorry, I didn't understand that. Send 'Hi' to start the conversation.");
        }
    } catch (error) {
        console.error('Error:', error);
        await sendWhatsAppMessage(from, 'An error occurred. Please try again.');
    }

    res.sendStatus(200);
});

// Function to send WhatsApp messages
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

// Function to send interactive buttons
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

// Function to fetch vehicle details
async function fetchVehicle(vehicleNumber) {
    const url = `https://app.jaimik.com/wp_api/wp_check.php?vehicleNumber=${vehicleNumber}`;
    try {
        const response = await axios.get(url);
        if (response.data && response.data.length > 0) {
            return { success: true, data: response.data };
        } else {
            return { success: false, message: 'No data found for this vehicle number.' };
        }
    } catch (error) {
        console.error('Error fetching vehicle details:', error.message);
        return { success: false, message: 'Error fetching vehicle details.' };
    }
}

// Function to submit a complaint
async function submitComplaint(from, userState) {
    const url = `https://app.jaimik.com/wp_api/wp_push.php?vehicleNumber=${userState.vehicleNumber}&imei=${userState.imei}&lat=${userState.latitude}&long=${userState.longitude}`;
    try {
        const response = await axios.get(url);
        if (response.data?.msg === 'success') {
            await sendWhatsAppMessage(from, 'Complaint submitted successfully.');
        } else {
            await sendWhatsAppMessage(from, 'Complaint submission unsuccessful.');
        }
    } catch (error) {
        console.error('Error submitting complaint:', error.message);
        await sendWhatsAppMessage(from, 'An error occurred while submitting your complaint.');
    }
}

// Webhook verification
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
