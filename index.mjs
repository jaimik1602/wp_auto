// const express = require('express');
import express from 'express';
// const bodyParser = require('body-parser');
import bodyParser from 'body-parser';
// const fetch = require('node-fetch');
import fetch from 'node-fetch';

const app = express();
app.use(bodyParser.json());

// Replace with your credential
const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0/457951767408582/messages';
const ACCESS_TOKEN = 'EAAfwtGARyrgBO91z8yDt2bnCtvlsI1ACgZBhxDjsignAXsKB1mNiEEBOn43JCqnwpxS2Eem18eRa8Ny6pZBZBFufa8e2xkvPpoZBplyaJ56GoVcc1S4DhzrNecIR3KuUJZBxtj2dNIf43SManEPSWUCNll7L5NNoQZAZA6wVCPsyZCFeTBTpoajFCir8zsKpLBZBYNjvgTBdZBlrKccm51Sxzsgoqh1BZAjB6X8pYz2iZB6J2NgZD';

// States to manage interactions
const pendingVehicleRequests = new Map();
const awaitingLocation = new Map();
let oldVehicleData = null;

// Helper function to send a WhatsApp message
async function sendMessage(recipient, text) {
  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient,
        text: { body: text },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Error sending message:', data);
    }
  } catch (error) {
    console.error('Error sending message:', error.message);
  }
}

// Fetch vehicle information with detailed error handling
async function fetchVehicleInfo(vehicleNumber) {
  const url = `https://vtmscgm.gujarat.gov.in/OpenVehicleStatus/GetOpenVehicleStatus?vehiclenumber=${vehicleNumber}`;
  try {
    const response = await fetch(url, { timeout: 10000 }); // 10-second timeout
    if (!response.ok) {
      return {
        success: false,
        message: `Server Error: ${response.status} - ${response.statusText}`,
      };
    }
    const data = await response.json();
    if (data && data.length > 0) {
      return { success: true, data };
    } else {
      return {
        success: false,
        message: 'No data found for this vehicle number. Please check the number and try again.',
      };
    }
  } catch (error) {
    if (error.type === 'request-timeout') {
      return {
        success: false,
        message: 'Request timed out. Please try again later.',
      };
    }
    return {
      success: false,
      message: 'No response from the API. The server might be down or unreachable.',
    };
  }
}

// Webhook for incoming messages
app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (body.object && body.entry && body.entry[0].changes[0].value.messages) {
    const messages = body.entry[0].changes[0].value.messages;

    for (const message of messages) {
      const chatId = message.from;
      const messageType = message.type;
      const messageContent = message.text?.body?.trim().toLowerCase();

      if (!pendingVehicleRequests.has(chatId)) {
        pendingVehicleRequests.set(chatId, { awaitingVehicleNumber: false, attempts: 0 });
      }
      const userState = pendingVehicleRequests.get(chatId);

      if (messageContent === 'hi') {
        await sendMessage(chatId, 'Hello! Please enter your vehicle number:');
        userState.awaitingVehicleNumber = true;
        userState.attempts = 0;
        continue;
      }

      if (userState.awaitingVehicleNumber) {
        const vehicleNumber = messageContent.toUpperCase();
        const result = await fetchVehicleInfo(vehicleNumber);

        if (result.success) {
          oldVehicleData = result.data;
          await sendMessage(chatId, `Vehicle Information:\n${JSON.stringify(result.data, null, 2)}`);
          userState.awaitingVehicleNumber = false;
          awaitingLocation.set(chatId, true);
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

      if (awaitingLocation.has(chatId) && messageContent === 'update') {
        await sendMessage(chatId, 'Please share your current location.');
        awaitingLocation.delete(chatId);
        continue;
      }

      if (messageType === 'location') {
        const { latitude, longitude } = message.location;

        const now = new Date();
        const currentDate = now.toISOString().split('T')[0].replace(/-/g, '');
        const currentTime = now.toISOString().split('T')[1].replace(/:/g, '').split('.')[0];

        const dataString = `$NRM,WTEX,1.ONTC,NR,01,L,${oldVehicleData[0].deviceid},${oldVehicleData[0].vehicleregno},1,${currentDate},${currentTime},${latitude},N,${longitude},E,0.0,229.84,27,0114.04,2.00,0.41,Vodafone,0,1,25.4,4.0,0,C,22,404,05,16c5,895b,16,16c5,8959,15,16c5,8aff,15,16c5,8afe,10,16c5,895a,0000,00,047834,5400.000,0.000,1450.092,()*D4`;

        await sendMessage(chatId, 'Submitting your complaint. Please wait...');
        const net = require('net');
        const clientSocket = new net.Socket();
        clientSocket.connect(5001, '103.234.162.150', async () => {
          console.log('Connected to server!');
          clientSocket.write(dataString);
          await new Promise((r) => setTimeout(r, 10000));
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
  const VERIFY_TOKEN = 'jaimik';

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