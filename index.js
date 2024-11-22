const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const net = require('net');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Replace with your credentials
const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0/457951767408582/messages';
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN; // Add to .env file
const VERIFY_TOKEN = process.env.VERIFY_TOKEN; // Add to .env file

// States to manage interactions
const pendingVehicleRequests = new Map();
const awaitingLocation = new Map();
let oldVehicleData = null;

// Helper function to send a WhatsApp message
async function sendMessage(recipient, text) {
  try {
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: recipient,
        text: { body: text },
      },
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
  }
}

// Fetch vehicle information with detailed error handling
async function fetchVehicleInfo(vehicleNumber) {
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

// Webhook for incoming messages
app.post('/webhook', async (req, res) => {
  const body = req.body;
  // console.log(body);
  if (body.object && body.entry && body.entry[0].changes[0].value.messages) {
    const messages = body.entry[0].changes[0].value.messages;

    for (const message of messages) {
      const chatId = message.from;
      console.log('Message from:', chatId);
      const messageType = message.type;
      const messageContent = message.text?.body?.trim().toLowerCase();

      // Initialize or retrieve user's state
      if (!pendingVehicleRequests.has(chatId)) {
        pendingVehicleRequests.set(chatId, { awaitingVehicleNumber: false, attempts: 0 });
      }
      const userState = pendingVehicleRequests.get(chatId);

      // Step 1: Handle "hi" message
      if (messageContent === 'hi') {
        await sendMessage(chatId, 'Hello! Please enter your vehicle number:');
        userState.awaitingVehicleNumber = true;
        userState.attempts = 0;
        continue;
      }

      // Step 2: Handle vehicle number input
      if (userState.awaitingVehicleNumber) {
        const vehicleNumber = messageContent.toUpperCase();
        const result = await fetchVehicleInfo(vehicleNumber);

        if (result.success) {
          oldVehicleData = result.data; // Save data for later use
          await sendMessage(chatId, `Vehicle Information:\n${JSON.stringify(result.data, null, 2)}`);
          userState.awaitingVehicleNumber = false;
          awaitingLocation.set(chatId, true); // Move to the next step (location request)
          await sendMessage(chatId, 'If you wish to submit an update, type "Update".');
        } else {
          userState.attempts++;
          if (userState.attempts >= 3) {
            await sendMessage(chatId, 'Maximum attempts reached. Please try again later.');
            pendingVehicleRequests.delete(chatId);
          } else {
            await sendMessage(chatId, `Error fetching vehicle information: ${result.message}`);
          }
        }
        continue;
      }

      // Step 3: Handle "Update" command
      if (awaitingLocation.has(chatId) && messageContent === 'update') {
        await sendMessage(chatId, 'Please share your current location.');
        awaitingLocation.delete(chatId);
        continue;
      }

      // Step 4: Handle location message
      if (messageType === 'location') {
        const { latitude, longitude } = message.location;

        const now = new Date();
        const currentDate = now.toISOString().split('T')[0].replace(/-/g, '');
        const currentTime = now.toISOString().split('T')[1].replace(/:/g, '').split('.')[0];

        const dataString = `$NRM,WTEX,1.ONTC,NR,01,L,${oldVehicleData[0].deviceid},${oldVehicleData[0].vehicleregno},1,${currentDate},${currentTime},${latitude},N,${longitude},E,0.0,229.84,27,0114.04,2.00,0.41,Vodafone,0,1,25.4,4.0,0,C,22,404,05,16c5,895b,16,16c5,8959,15,16c5,8aff,15,16c5,8afe,10,16c5,895a,0000,00,047834,5400.000,0.000,1450.092,()*D4`;

        await sendMessage(chatId, 'Submitting your complaint. Please wait...');

        // Send data to server
        const net = require('net');
        const clientSocket = new net.Socket();
        clientSocket.connect(5001, '103.234.162.150', async () => {
          console.log('Connected to server!');
          clientSocket.write(dataString);
          await new Promise((r) => setTimeout(r, 10000)); // Delay for 10 seconds
          await sendMessage(chatId, 'Complaint submitted successfully.');
        });

        clientSocket.on('error', async (error) => {
          console.error('Socket error:', error.message);
          await sendMessage(chatId, 'Error sending complaint to server.');
        });

        clientSocket.on('close', () => {
          console.log('Connection closed');
        });
      }
    }
  }

  res.sendStatus(200);
});

// Webhook Verification
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = 'YOUR_VERIFY_TOKEN';

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Start the server
app.listen(3000, () => {
  console.log('Server is listening on port 3000');
});
