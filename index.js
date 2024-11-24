const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0/469434999592396/messages';
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

// Store user states and session tracking
const userStates = {};

// Helper to check if session has expired
const isSessionActive = (startTime) => {
    return Date.now() - startTime <= 5 * 60 * 1000; // 5 minutes
};

// Reset user state
const resetUserState = (from) => {
    delete userStates[from];
};

// Webhook for incoming messages
app.post('/webhook', async (req, res) => {
    const messages = req.body.entry[0].changes[0].value.messages;

    if (!messages || messages.length === 0) return res.sendStatus(200);

    const message = messages[0];
    const from = message.from; // User's phone number
    const text = message.text?.body?.trim(); // User's message content

    console.log(`Message from ${from}: ${text}`);

    if (!userStates[from]) {
        // Initialize user state if not already set
        userStates[from] = { step: 0, invalidAttempts: 0, startTime: Date.now() };
    }

    const userState = userStates[from];

    // Check session timeout
    if (!isSessionActive(userState.startTime)) {
        await sendWhatsAppMessage(from, "Your session has ended. Send 'Hi' to start the conversation.");
        resetUserState(from);
        return res.sendStatus(200);
    }

    try {
        if (userState.step === 0 && text.toLowerCase() === 'hi') {
            // Start conversation
            await sendWhatsAppMessage(from, 'Please enter your vehicle number.');
            userState.step = 1;
            userState.startTime = Date.now(); // Reset session start time
        } else if (userState.step === 1) {
            // Vehicle number validation
            const vehicleNumber = text;
            const response = await fetchVehicle(vehicleNumber);

            if (!response.success || !response.data[0]['deviceid']) {
                userState.invalidAttempts++;
                if (userState.invalidAttempts < 3) {
                    await sendWhatsAppMessage(from, `Invalid vehicle number. Please try again. (${userState.invalidAttempts}/3 attempts)`);
                } else {
                    await sendWhatsAppMessage(from, "You've exceeded the maximum attempts. Send 'Hi' to restart.");
                    resetUserState(from);
                }
            } else {
                userState.vehicleNumber = vehicleNumber;
                userState.imei = response.data[0]['deviceid']; // Store IMEI
                await sendInteractiveMessage(
                    from,
                    `Welcome Back - ${vehicleNumber} \nSub Agency - ${response.data[0]['subagency']}\nIMEI - ${response.data[0]['deviceid']}\nLast Update - ${response.data[0]['received_Date']}`,
                    [
                        {
                            type: 'reply',
                            reply: { id: 'update_device', title: 'Update From Device' }
                        },
                        {
                            type: 'reply',
                            reply: { id: 'update_link', title: 'Update From Link' }
                        }
                    ]
                );
                userState.step = 2;
            }
        }
        else if (userState.step === 2) {
            // Handle interactive button response
            const buttonId = message.interactive?.button_reply?.id;

            if (buttonId === 'update_device') {
                await sendLocationRequest(from);
                userState.step = 3;
            } else if (buttonId === 'update_link') {
                await sendWhatsAppMessage(from, "Forward your driver's location in this chat.");
                userState.step = 3; // Proceed to wait for location
            }
        } else if (userState.step === 3) {
            // Handle location or response after the "Update Link" button
            if (message.location) {
                const { latitude, longitude } = message.location;
                userState.latitude = latitude;
                userState.longitude = longitude;

                // Proceed with complaint submission
                await submitComplaint(from, userState);
                resetUserState(from);
            } else {
                await sendWhatsAppMessage(from, 'Please share your location using the attachment icon.');
            }
        } else {
            // Invalid response or fallback
            await sendWhatsAppMessage(from, 'Sorry, I didn\'t understand that. Please start again by saying "Hi".');
            resetUserState(from);
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
