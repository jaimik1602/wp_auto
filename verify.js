const axios = require('axios');

// Replace with your actual certificate string
const CERTIFICATE_STRING = `CnMKLwjVwbftsLHUAxIGZW50OndhIhZaIFBsdXMgU2VjdXJpdHkgU3lzdGVtULnRgboGGkDLRt0l7VirX7Znsd2dptsKtyVyo6mClkmVfgVVlPJz4evryW8r9cj+eRIF54j6CtQfHP2Yf7uSFwlMWScVowsMEi5tRQHGh5C/U+BEh7ORr2wqnFjn5lvF2KSXTTtOrTy8bc5i8NnTJkYTy2ZAKWNb`;

// Replace with your actual access token and registration endpoint
const ACCESS_TOKEN = 'EAAZAZCxUCCBOwBOZCzgQAesnRKEY6VZC5VDP249lmpHmVVgg8RWhDcOXR6wZBHcif7hY6UoO8FUW4s7xaFDmoUh1kYNDzlqRSjomdyVH0CyMZCYPruxwZBZBTqL1ZB1yTf0DfdyhErZBUmH89dJdXuROVyes8ab6D58O6yZAtnVW1IgAZBIZCXzJJWaM2AcuSZCpD2am60fwZDZD';
const REGISTRATION_URL = 'https://graph.facebook.com/v21.0/477412112126570/register';

// Replace with the actual 6-digit PIN sent to your phone
const PIN = '162004';

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
