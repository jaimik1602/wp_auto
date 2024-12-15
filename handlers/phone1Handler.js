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
  const currentWeek = getCurrentWeek();

  console.log("Handling message for Phone 1:", text);

  // Save the number and WhatsApp name to the database
  var temp = await saveContactToDatabase(from, name);
  console.log(temp);

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
        var userlevel = await checkUserLevel(phoneNumber);
        //user level check
        if (userlevel) {
          userState.vehicleNumber = formattedVehicleNumber;
          userState.imei = response.data[0].deviceid;
          userState.agency = response.data[0].agency;
          userState.subagency = response.data[0].subagency;
          // if (
          //   userState.subagency == "GaneshAtlanta" ||
          //   userState.subagency == "MARUTI"
          // ) {
          //   resetUserState(from);
          //   await sendWhatsAppMessage(
          //     from,
          //     "Subagency is restricted. For better service, please contact 88662 65662 on WhatsApp.",
          //     "en"
          //   );
          //   await sendWhatsAppMessage(
          //     from,
          //     "सब एजेंसी प्रतिबंधित है। बेहतर सेवा के लिए कृपया 88662 65662 पर WhatsApp पर संपर्क करें।",
          //     "hi"
          //   );
          //   await sendWhatsAppMessage(
          //     from,
          //     "સબએજન્સી પ્રતિબંધિત છે. વધુ સારી સેવા માટે, કૃપા કરીને WhatsApp પર 88662 65662 પર સંપર્ક કરો.",
          //     "gu"
          //   );
          // } else {
          await sendInteractiveMessage(from, [
            formattedVehicleNumber,
            response.data[0].lattitude,
            response.data[0].longitude,
            response.data[0].speed,
            response.data[0].received_Date,
            response.data[0].servertime,
          ]);
          userState.step = 2;
          // }
        } else {
          //
          var result = await weekCheck(
            formattedVehicleNumber,
            phoneNumber,
            currentWeek
          );
          if (result) {
            userState.vehicleNumber = formattedVehicleNumber;
            userState.imei = response.data[0].deviceid;
            userState.agency = response.data[0].agency;
            userState.subagency = response.data[0].subagency;
            // if (
            //   userState.subagency == "GaneshAtlanta" ||
            //   userState.subagency == "MARUTI"
            // ) {
            //   resetUserState(from);
            //   await sendWhatsAppMessage(
            //     from,
            //     "Subagency is restricted. For better service, please contact 88662 65662 on WhatsApp.",
            //     "en"
            //   );
            //   await sendWhatsAppMessage(
            //     from,
            //     "सब एजेंसी प्रतिबंधित है। बेहतर सेवा के लिए कृपया 88662 65662 पर WhatsApp पर संपर्क करें।",
            //     "hi"
            //   );
            //   await sendWhatsAppMessage(
            //     from,
            //     "સબએજન્સી પ્રતિબંધિત છે. વધુ સારી સેવા માટે, કૃપા કરીને WhatsApp પર 88662 65662 પર સંપર્ક કરો.",
            //     "gu"
            //   );
            // } else {
            await sendInteractiveMessage(from, [
              formattedVehicleNumber,
              response.data[0].lattitude,
              response.data[0].longitude,
              response.data[0].speed,
              response.data[0].received_Date,
              response.data[0].servertime,
            ]);
            userState.step = 2;
            // }
          } else {
            resetUserState(from);
            await sendWhatsAppMessage(
              from,
              "You've reached your weekly limit for vehicle complaints, please try another mobile number to register a complaint.",
              "en"
            );
            await sendWhatsAppMessage(
              from,
              "आप वाहन शिकायतों के लिए अपनी साप्ताहिक सीमा तक पहुँच गए हैं, कृपया शिकायत दर्ज करने के लिए कोई अन्य मोबाइल नंबर आज़माएँ।",
              "hi"
            );
            await sendWhatsAppMessage(
              from,
              "તમે વાહનની ફરિયાદો માટે તમારી સાપ્તાહિક મર્યાદા સુધી પહોંચી ગયા છો, કૃપા કરીને બીજા મોબાઈલ નંબર થી ફરિયાદ દાખલ કરો.",
              "gu"
            );
          }
          //
        }
      }
    } else if (userState.step === 2) {
      const buttonId = message.interactive.button_reply.id;
      console.log(buttonId);
      if (buttonId === "update_button") {
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
        userState.latitude = parseFloat(latitude).toFixed(6);
        userState.longitude = parseFloat(longitude).toFixed(6);
        console.log(userState.latitude, userState.longitude);
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

  //   res.sendStatus(200);
};

// Utility: Get current week number
const getCurrentWeek = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
};

async function weekCheck(vehicleNumber, mobileNumber, currentWeek) {
  try {
    // Step 1: Check if the vehicle is already registered this week
    const [result] = await db.query(
      "SELECT * FROM weekly_data WHERE vehicle_number = ? AND mobile_number = ? AND week = ?",
      [vehicleNumber, mobileNumber, currentWeek]
    );

    if (result.length > 0) {
      // Vehicle is already registered this week
      console.log("Already Registered");
      return true; // Already registered, return true
    } else {
      // Step 2: Check how many vehicles the user has registered this week
      const [countResult] = await db.query(
        "SELECT COUNT(DISTINCT vehicle_number) AS vehicle_count FROM weekly_data WHERE mobile_number = ? AND week = ?",
        [mobileNumber, currentWeek]
      );

      const vehicleCount = countResult[0].vehicle_count;

      if (vehicleCount >= 2) {
        // User has already registered two vehicles this week
        console.log("Limit Error");
        return false; // Limit reached, return false
      } else {
        // Step 3: Register the new vehicle
        await db.query(
          "INSERT INTO weekly_data (vehicle_number, mobile_number, week, created_at) VALUES (?, ?, ?, NOW())",
          [vehicleNumber, mobileNumber, currentWeek]
        );

        console.log("Vehicle Added!!");
        return true; // Vehicle successfully added, return true
      }
    }
  } catch (err) {
    console.error(err);
    return { message: "Database error.", error: err }; // Handle any errors
  }
}

// Database function to save contact information
async function saveContactToDatabase(number, name) {
  try {
    console.log("save run!!!");

    // Query to check if the phone_number and name match
    const checkQuery = `SELECT * FROM users WHERE phone_number = ? AND name = ?`;
    const [results] = await db.execute(checkQuery, [number, name]);

    // If a matching record is found, do nothing
    if (results.length > 0) {
      console.log(`Contact already exists: ${number} - ${name}`);
      return;
    }

    // Insert or update the contact
    const query = `
      INSERT INTO users (phone_number, name) 
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `;
    await db.execute(query, [number, name]);
    console.log(`Saved or updated contact: ${number} - ${name}`);
  } catch (err) {
    console.error("Error interacting with the database:", err);
  }
}

// Function to check user_level based on mobile number using async/await
async function checkUserLevel(mobileNumber) {
  try {
    const [results] = await db.execute(
      "SELECT user_level FROM users WHERE phone_number = ?",
      [mobileNumber]
    );

    if (results.length > 0) {
      return results[0].user_level === 1; // Returns true if user_level is 1, else false
    } else {
      return false; // Returns false if user not found
    }
  } catch (err) {
    console.error("Database error:", err);
    return false; // Return false in case of an error
  }
}

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
      to, // The recipient's phone number
      type: "interactive",
      interactive: {
        type: "button",
        header: {
          type: "text",
          text: "Vehicle Information",
        },
        body: {
          text: `Vehicle Number: ${
            formattedVehicleNumber || "N/A"
          }\nLatitude: ${deviceId || "N/A"}\nLongitude: ${agency || "N/A"}
                \nSpeed: ${subAgency || "N/A"}\nReceived Date: ${
            receivedDate || "N/A"
          }\nServer Time: ${serverTime || "N/A"}`,
        },
        footer: {
          text: "Tap to update.",
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: {
                id: "update_button",
                title: "Update",
              },
            },
          ],
        },
      },
    },
    {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`, // Bearer token for authorization
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
      // Send success messages in multiple languages
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

      // Polling to check if latitude and longitude match
      const pollLatLng = async () => {
        try {
          // Fetch updated data from the API
          const apiResponse = await axios.get(
            `https://app.jaimik.com/wp_api/wp_check.php?vehicleNumber=${userState.vehicleNumber}`
          );

          const apiData = apiResponse.data[0]; // Assuming the API returns an array

          // Format API latitude and longitude to six decimal places
          const apiLatitude = parseFloat(apiData.lattitude).toFixed(6);
          const apiLongitude = parseFloat(apiData.longitude).toFixed(6);

          // Compare with userState latitude and longitude
          if (
            userState.latitude === apiLatitude &&
            userState.longitude === apiLongitude
          ) {
            // Send data update success message
            await sendWhatsAppMessage(
              from,
              "Your data has been updated successfully.",
              "en"
            );
            await sendWhatsAppMessage(
              from,
              "आपका डेटा सफलतापूर्वक अपडेट हो गया है।",
              "hi"
            );
            await sendWhatsAppMessage(
              from,
              "તમારા ડેટા સફળતાપૂર્વક અપડેટ થયા છે.",
              "gu"
            );
          } else {
            // If not matching, retry after 5 seconds
            console.log("Lat/Long do not match. Retrying in 5 seconds...");
            setTimeout(pollLatLng, 5000);
          }
        } catch (error) {
          console.error("Error polling API:", error);
        }
      };

      // Start polling
      pollLatLng();
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
