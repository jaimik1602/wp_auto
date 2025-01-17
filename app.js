const express = require("express");
const app = express();
app.use(express.json());

// Import handlers dynamically
const phone1Handler = require("./handlers/phone1Handler");
const phone2Handler = require("./handlers/phone2Handler");

// Define phone number IDs
const PHONE_NUMBER_1 = "469434999592396";
const PHONE_NUMBER_2 = "532876653233461";

app.post("/webhook", (req, res) => {
  console.log(req.body);
  const body = req.body;

  if (body && body.entry && body.entry.length > 0) {
    const entry = body.entry[0];
    const changes = entry.changes;

    if (changes && changes.length > 0) {
      const change = changes[0];
      const phoneNumberId = change.value.metadata.phone_number_id;
      const message = change.value.messages ? change.value.messages[0] : null;

      if (message) {
        // Route to the appropriate handler based on phone_number_id
        switch (phoneNumberId) {
          case PHONE_NUMBER_1:
            phone1Handler.handleMessage(req, res);
            break;
          case PHONE_NUMBER_2:
            phone2Handler.handleMessage(req, res, message);
            break;
          default:
            console.log("Unknown phone number ID:", phoneNumberId);
        }
      }
    }
  }

  // Respond to WhatsApp webhook
  res.sendStatus(200);
});

// Webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Start the server
app.listen(3000, () => {
  console.log("Webhook server is running on port 3000");
});
