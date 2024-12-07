const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mysql = require("mysql2/promise");
require("dotenv").config();

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const WHATSAPP_API_URL =
  "https://graph.facebook.com/v21.0/469434999592396/messages";
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

exports.handleMessage = async (req, res) => {
  const app = express();
  app.use(bodyParser.json());

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
    }, 5 * 60 * 1000); // 5 minutes in milliseconds
  }
  console.log(JSON.stringify(req.body, null, 2));
  // console.log(req.body.entry[0].changes[0].value.messages);
  const messages = req.body.entry[0].changes[0].value.messages;
  if (!messages || messages.length === 0) return res.sendStatus(200);

  const message = messages[0];
  console.log("Handling message for Phone 1:", message.text.body);
  const from = message.from;
  const text = message.text?.body?.trim();

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
        "Please enter your vehicle number.",
        "en"
      );
      await sendWhatsAppMessage(
        from,
        "कृपया अपनी वाहन संख्या दर्ज करें।",
        "hi"
      );
      await sendWhatsAppMessage(from, "કૃપયા તમારો વાહન નંબર દાખલ કરો.", "gu");
      userState.step = 1;
    } else if (userState.step === 1) {
      const formattedVehicleNumber = formatVehicleNumber(text);
      const phoneNumber = from; // Assuming 'from' contains the user's mobile number
      console.log(
        `Vehicle Number: ${formattedVehicleNumber}, Phone Number: ${phoneNumber}`
      );
      const response = await fetchVehicle(formattedVehicleNumber, phoneNumber);
      if (!response.success || !response.data[0]?.deviceid) {
        if (response.message == "expiry") {
          resetUserState(from);
          await sendWhatsAppMessage(
            from,
            "Vehicle Recharge is over!!!\nContact on this number :- +91 88662 65662",
            "en"
          );
          await sendWhatsAppMessage(
            from,
            "वाहन रिचार्ज ख़त्म!!!\nइस नंबर पर संपर्क करें:- +91 88662 65662",
            "hi"
          );
          await sendWhatsAppMessage(
            from,
            "વાહન રિચાર્જ સમાપ્ત થઈ ગયું છે !!!\nઆ નંબર પર સંપર્ક કરો:- +91 88662 65662",
            "gu"
          );
        } else {
          userState.vehicleAttempts += 1;
          if (userState.vehicleAttempts >= 3) {
            resetUserState(from);
            await sendWhatsAppMessage(
              from,
              "You have exceeded the allowed attempts. Send 'Hi' to start the conversation.",
              "en"
            );
            await sendWhatsAppMessage(
              from,
              "आपने अनुमत प्रयासों को पार कर लिया है। 'Hi' भेजकर बातचीत शुरू करें।",
              "hi"
            );
            await sendWhatsAppMessage(
              from,
              "તમે અનુમતિ આપેલા પ્રયત્નો પાર કરી દીધા છે. 'Hi' મોકલીને સંવાદ શરૂ કરો.",
              "gu"
            );
          } else {
            await sendWhatsAppMessage(
              from,
              `Enter Correct Vehicle Number!!!`,
              "en"
            );
            await sendWhatsAppMessage(from, `सही वाहन नंबर दालीये!!!`, "hi");
            await sendWhatsAppMessage(from, `સાચો વાહન નંબર દાખલ કરો!!!`, "gu");
          }
        }
      } else {
        userState.vehicleNumber = formattedVehicleNumber;
        userState.imei = response.data[0].deviceid;
        userState.agency = response.data[0].agency;
        userState.subagency = response.data[0].subagency;
        await sendInteractiveMessage(from, [
          formattedVehicleNumber,
          response.data[0].deviceid,
          response.data[0].agency,
          response.data[0].subagency,
          response.data[0].received_Date,
          response.data[0].servertime,
        ]);
        userState.step = 2;
      }
    } else if (userState.step === 2) {
      const buttonId = message.button?.payload;
      console.log(buttonId);
      if (buttonId === "Update") {
        await sendLocationRequest(from);
        userState.step = 3;
      } else {
        userState.locationAttempts += 1;
        if (userState.locationAttempts >= 3) {
          resetUserState(from);
          await sendWhatsAppMessage(
            from,
            "You have exceeded the allowed attempts. Send 'Hi' to start the conversation.",
            "en"
          );
          await sendWhatsAppMessage(
            from,
            "आपने अनुमत प्रयासों को पार कर लिया है। 'Hi' भेजकर बातचीत शुरू करें।",
            "hi"
          );
          await sendWhatsAppMessage(
            from,
            "તમે અનુમતિ આપેલા પ્રયત્નો પાર કરી દીધા છે. 'Hi' મોકલીને સંવાદ શરૂ કરો.",
            "gu"
          );
        } else {
          await sendWhatsAppMessage(from, `Invalid option.`, "en");
          await sendWhatsAppMessage(from, `अमान्य विकल्प।`, "hi");
          await sendWhatsAppMessage(from, `અમાન્ય વિકલ્પ.`, "gu");
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
          await sendWhatsAppMessage(
            from,
            "You have exceeded the allowed attempts. Send 'Hi' to start the conversation.",
            "en"
          );
          await sendWhatsAppMessage(
            from,
            "आपने अनुमत प्रयासों को पार कर लिया है। 'Hi' भेजकर बातचीत शुरू करें।",
            "hi"
          );
          await sendWhatsAppMessage(
            from,
            "તમે અનુમતિ આપેલા પ્રયત્નો પાર કરી દીધા છે. 'Hi' મોકલીને સંવાદ શરૂ કરો.",
            "gu"
          );
        } else {
          await sendWhatsAppMessage(
            from,
            `Please share a valid location.`,
            "en"
          );
          await sendWhatsAppMessage(
            from,
            `कृपया एक मान्य स्थान साझा करें।`,
            "hi"
          );
          await sendWhatsAppMessage(from, `કૃપયા માન્ય સ્થાન શેર કરો.`, "gu");
        }
      }
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

  res.sendStatus(200);
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

// Function to check and add vehicle number and phone number to the database
async function checkAndAddVehicleToDB(vehicleNumber, phoneNumber) {
  try {
    // Check if the vehicle number already exists in the database
    const [rows] = await db.query(
      "SELECT * FROM vehicle_list WHERE vehicle_number = ?",
      [vehicleNumber]
    );
    if (rows.length === 0) {
      // If vehicle number does not exist, insert it along with the phone number
      await db.query(
        "INSERT INTO vehicle_list (vehicle_number, phone_number) VALUES (?, ?)",
        [vehicleNumber, phoneNumber]
      );
      console.log(
        `Vehicle number ${vehicleNumber} and phone number ${phoneNumber} added to the database.`
      );
    } else {
      console.log(
        `Vehicle number ${vehicleNumber} already exists in the database.`
      );
    }
  } catch (error) {
    console.error("Error adding vehicle to database:", error);
  }
}

//expiry check
async function expiryCheck(vehicleNumber) {
  try {
    // Check if the vehicle number already exists in the database
    const [rows] = await db.query(
      "SELECT * FROM expiry_list WHERE vehicle_number = ?",
      [vehicleNumber]
    );
    if (rows.length === 0) {
      // If vehicle number does not exist, insert it along with the phone number
      console.log(`Vehicle number is expired.`);
      return false;
    } else {
      console.log(`Vehicle number is not expired`);
      return true;
    }
  } catch (error) {
    console.error("Error checking vehicle to database:", error);
  }
}

// Function to send interactive buttons
async function sendInteractiveMessage(to, vehicleDetails) {
  if (vehicleDetails.length < 6) {
    console.error("Missing vehicle details for template.");
    return;
  }

  const [
    formattedVehicleNumber,
    deviceId,
    agency,
    subAgency,
    receivedDate,
    serverTime,
  ] = vehicleDetails;

  await axios.post(
    WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      type: "template",
      to,
      template: {
        name: "vehicle_details", // Ensure this template exists in your WhatsApp API
        language: {
          code: "en",
        },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: formattedVehicleNumber || "N/A" },
              { type: "text", text: deviceId || "N/A" },
              { type: "text", text: agency || "N/A" },
              { type: "text", text: subAgency || "N/A" },
              { type: "text", text: receivedDate || "N/A" },
              { type: "text", text: serverTime || "N/A" },
            ],
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    }
  );
}

// Function to request location
async function sendLocationRequest(to) {
  // Function to request location sharing with an interactive button
  await axios.post(
    WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      type: "interactive",
      to,
      interactive: {
        type: "location_request_message",
        body: {
          text: 'Please share your current location by using the attachment icon in WhatsApp and selecting "Location".',
        },
        action: {
          name: "send_location",
        },
      },
    },
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
}

// Function to format vehicle number
function formatVehicleNumber(vehicleNumber) {
  // Remove spaces and normalize vehicle number formatting
  return vehicleNumber.replace(/\s+/g, "").toUpperCase();
}

// Function to fetch vehicle details from API
async function fetchVehicle(vehicleNumber, phoneNumber) {
  try {
    const res = await axios.get(
      `https://app.jaimik.com/wp_api/wp_check.php?vehicleNumber=${vehicleNumber}`
    );
    console.log(
      `https://app.jaimik.com/wp_api/wp_check.php?vehicleNumber=${vehicleNumber}`
    );

    if (res.data && res.data[0] && res.data[0].deviceid) {
      // After verifying, check and add to the database
      await checkAndAddVehicleToDB(vehicleNumber, phoneNumber);
      // if (await expiryCheck(vehicleNumber)) {
      //   return {
      //     success: false, //need
      //     message: "expiry",
      //   };
      // } else {
      return { success: true, data: res.data };
      // }
    } else {
      return {
        success: false, //need+
        message: "No data found for this vehicle number.",
      };
    }
  } catch (error) {
    return { success: false, message: "Error while fetching vehicle data." };
  }
}

// Submit complaint to another API
async function submitComplaint(from, userState) {
  const url = `https://app.jaimik.com/wp_api/wp_push.php?vehicleNumber=${userState.vehicleNumber}&imei=${userState.imei}&lat=${userState.latitude}&long=${userState.longitude}&agency=${userState.agency}&subagency=${userState.subagency}&number=${from}`;
  try {
    const response = await axios.get(url);
    if (response.data?.msg === "success") {
      await sendWhatsAppMessage(
        from,
        "Your complaint has been submitted successfully.",
        "en"
      );
      await sendWhatsAppMessage(
        from,
        "आपकी शिकायत सफलतापूर्वक दर्ज की गई है।",
        "hi"
      );
      await sendWhatsAppMessage(
        from,
        "તમારી ફરિયાદ સફળતાપૂર્વક નોંધાઈ છે.",
        "gu"
      );
    } else {
      await sendWhatsAppMessage(
        from,
        "Your complaint submission failed. Please try again later.",
        "en"
      );
      await sendWhatsAppMessage(
        from,
        "आपकी शिकायत सबमिट नहीं की गई। कृपया बाद में पुनः प्रयास करें।",
        "hi"
      );
      await sendWhatsAppMessage(
        from,
        "તમારી ફરિયાદ સબમિશન નિષ્ફળ. કૃપા કરીને પછીથી ફરી પ્રયાસ કરો.",
        "gu"
      );
    }
  } catch (error) {
    console.error("Complaint submission error:", error);
    await sendWhatsAppMessage(
      from,
      "An error occurred while submitting your complaint. Please try again later.",
      "en"
    );
    await sendWhatsAppMessage(
      from,
      "आपकी शिकायत दर्ज करते समय त्रुटि हुई। कृपया फिर से प्रयास करें।",
      "hi"
    );
    await sendWhatsAppMessage(
      from,
      "તમારી ફરિયાદ નોંધતી વખતે ભૂલ થઈ છે. કૃપા કરીને પછીથી ફરી પ્રયાસ કરો.",
      "gu"
    );
  }
}
//   const port = process.env.PORT || 3000;
//   app.listen(port, () => console.log(`Server running on port ${port}`));
