const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const WHATSAPP_API_URL =
  "https://graph.facebook.com/v21.0/469434999592396/messages";
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

// User sessions to manage chat state
const userSessions = {};

// Track session timeouts
const sessionTimeouts = {};

// Helper function to reset user state
function resetUserState(from) {
  if (sessionTimeouts[from]) {
    clearTimeout(sessionTimeouts[from]);
    delete sessionTimeouts[from];
  }
  userSessions[from] = {
    step: 0,
    vehicleAttempts: 0,
    locationAttempts: 0,
    sessionStartTime: Date.now(),
  };
  sessionTimeouts[from] = setTimeout(async () => {
    delete userSessions[from];
    delete sessionTimeouts[from];
    await sendWhatsAppMessage(
      from,
      "Your session has ended. Send 'Hi' to start the conversation.",
      "en"
    );
    await sendWhatsAppMessage(
      from,
      "आपका सत्र समाप्त हो गया है। बातचीत शुरू करने के लिए 'Hi' भेजें।",
      "hi"
    );
    await sendWhatsAppMessage(
      from,
      "તમારો સમય સમાપ્ત થઈ ગયો છે. વાતચીત શરૂ કરવા માટે 'Hi' મોકલો.",
      "gu"
    );
  }, 5 * 60 * 1000); // 5 minutes in millisecondsnn
}

exports.handleMessage = async (req, res) => {
  const app = express();
  app.use(bodyParser.json());

  console.log(JSON.stringify(req.body, null, 2));
  const messages = req.body.entry[0].changes[0].value.messages;
  if (!messages || messages.length === 0) return res.sendStatus(200);

  const message = messages[0];
  const from = message.from;
  const name =
    req.body.entry[0].changes[0].value.contacts?.[0]?.profile?.name ||
    "Unknown";
  const text = message.text?.body?.trim();

  console.log("Handling message for Phone 1:", text);

  // Save the number and WhatsApp name to the database
  if (!userSessions[from]) resetUserState(from);

  const userState = userSessions[from];

  try {
    console.log(`Sender:- ${from} And Msg:- ${text}`);
    if (
      // userState.step === 0 &&
      typeof text === "string" &&
      text.toLowerCase() === "hi"
    ) {
      // resetUserState(from);
      await sendWhatsAppMessage(
        from,
        "The government server is currently down. Please try again later. We apologize for the inconvenience.",
        "en"
      );
      await sendWhatsAppMessage(
        from,
        "सरकारी सर्वर इस समय बंद है। कृपया बाद में पुनः प्रयास करें। हमें हुई असुविधा के लिए खेद है।",
        "hi"
      );
      await sendWhatsAppMessage(
        from,
        "સરકારનો સર્વર હાલમાં બંધ છે. કૃપા કરીને પછીથી ફરી પ્રયાસ કરો. અમને થયેલી અનિચ્છનીયtakઝુંચ માટે ક્ષમાયાચના છે.",
        "gu"
      );
    } else {
      resetUserState(from);
      await sendWhatsAppMessage(
        from,
        "Sorry, I didn't understand that. Send 'Hi' to start the conversation.",
        "en"
      );
      await sendWhatsAppMessage(
        from,
        "मुझे खेद है, मुझे यह समझ में नहीं आया। 'Hi' भेजकर बातचीत शुरू करें।",
        "hi"
      );
      await sendWhatsAppMessage(
        from,
        "મને ખેદ છે, મને તે સમજાયું નથી. 'Hi' મોકલીને સંવાદ શરૂ કરો.",
        "gu"
      );
    }
  } catch (error) {
    console.error("Error:", error);
    await sendWhatsAppMessage(
      from,
      "An error occurred. Please try again.",
      "en"
    );
    await sendWhatsAppMessage(
      from,
      "एक त्रुटि हुई। कृपया फिर से प्रयास करें।",
      "hi"
    );
    await sendWhatsAppMessage(
      from,
      "એક ખોટી ઘટના બની. કૃપા કરીને ફરી પ્રયાસ કરો.",
      "gu"
    );
  }

  //   res.sendStatus(200);
};

async function sendWhatsAppMessage(to, text, language) {
  const languages = {
    en: "en_US",
    hi: "hi_IN",
    gu: "gu_IN",
  };
  const selectedLanguage = languages[language] || "en_US";
  await axios.post(
    WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      to,
      text: { body: text },
      language: { code: selectedLanguage },
    },
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
}
