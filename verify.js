const axios = require('axios');

// Replace with your actual certificate string
const CERTIFICATE_STRING = `CnQKMAi/zbW3kNXSAhIGZW50OndhIhdaIFBsdXMgU2VjdXJpdHkgU3lzdGVtc1DQmIe6BhpA9s+f3taaOftj7K1T20/pf5Ht+EjdKWJMgzI8MZWDPFkJk2rOM74Z2IAE8D/Cx8QQ7q4ErDxDtG8tXMLGVY0gDxIubUN+kLfAk0PgRIezka9sKpxY5+ZbxNjN3ks7Tq085v0LpDy8XU8cwR6NusR1lg==`;

// Replace with your actual access token and registration endpoint
const ACCESS_TOKEN = 'EAAZAZCxUCCBOwBO3F9WfloAXENismkpNWB1bQEXZAr4rDnNBNPksYANMmnOiG18tu7VClZCDhhgptJogXafElFpz5GNLJHmZARy5ngHrCBR7zKSwfvZAqu4oKEIDTwNQ0YvlsLqXurYQIiLgRMvTxmeiuZAZBQtWb7Gc3ppvUxZAgrACtqxeGCB2MNGy5fUReV2KcZCQZDZD';
const REGISTRATION_URL = 'https://graph.facebook.com/v21.0/469434999592396/register';

// Replace with the actual 6-digit PIN sent to your phone
const PIN = '618255';

// Define the request payload
const payload = {
  messaging_product: 'whatsapp',
  cert: CERTIFICATE_STRING, // Certificate string
  pin: PIN, // Include the PIN
};

// Function to register the account
async function registerWhatsAppAccount() {
  try {
    const response = await axios.post(REGISTRATION_URL, payload, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('Registration Successful:', response.data);
  } catch (error) {
    console.error(
      'Registration Failed:',
      error.response?.data || error.message
    );
  }
}

// Call the function
registerWhatsAppAccount();
