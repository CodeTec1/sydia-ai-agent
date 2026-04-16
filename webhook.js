const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { processMessage } = require('./aiAgent');
const tools = require('./tools');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const SYDIA_WHATSAPP = process.env.SYDIA_WHATSAPP_NUMBER;

async function sendMessage(to, body) {
  try {
    await twilioClient.messages.create({ from: SYDIA_WHATSAPP, to, body });
  } catch (err) {
    console.error('Send message error:', err.message);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

router.post('/', async (req, res) => {
  const from = req.body.From;
  const message = req.body.Body?.trim();

  console.log(`Message from ${from}: ${message}`);

  res.status(200).send('<Response></Response>');

  try {
    // Get or create lead
    const lead = await tools.getOrCreateLead(from);
    if (!lead) {
      await sendMessage(from, 'Sorry, something went wrong. Please try again.');
      return;
    }

    // Load conversation history
    const history = await tools.getConversationHistory(lead.id);

    // Save user message to history
    await tools.saveMessage(lead.id, 'user', message);

    // Process through AI
    const aiResponse = await processMessage({
      userMessage: message,
      lead,
      conversationHistory: history
    });

    // Save AI response to history
    await tools.saveMessage(lead.id, 'assistant', aiResponse);

    // Send response to user
    // Split long messages if needed
    if (aiResponse.length > 1500) {
      const chunks = aiResponse.match(/.{1,1500}/gs) || [aiResponse];
      for (let i = 0; i < chunks.length; i++) {
        await sendMessage(from, chunks[i]);
        if (i < chunks.length - 1) await delay(1000);
      }
    } else {
      await sendMessage(from, aiResponse);
    }

  } catch (err) {
    console.error('Webhook error:', err);
    await sendMessage(from, 'Sorry, something went wrong. Please try again in a moment.');
  }
});

module.exports = router;