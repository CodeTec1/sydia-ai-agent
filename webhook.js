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
    const { text: aiResponse, properties } = await processMessage({
      userMessage: message,
      lead,
      conversationHistory: history
    });

    // Save AI response to history
    await tools.saveMessage(lead.id, 'assistant', aiResponse);

    // Send text response
    await sendMessage(from, aiResponse);

    // If properties were found, send each one with photo
    // If properties were found, send each one with photo
    if (properties && properties.length > 0) {
      await delay(1500);

      const searchResultsToSave = properties.map((p, i) => ({
        number: i + 1,
        id: p.id,
        name: p.name,
        price: p.rawPrice,
        location: p.location,
        address: p.address
      }));

      await tools.updateLead(lead.id, { search_results: searchResultsToSave });

      for (let i = 0; i < properties.length; i++) {
        const p = properties[i];
        const sizeText = p.bedrooms === 0 ? 'Studio' : p.bedrooms ? `${p.bedrooms} Bed` : '';
        const sqmText = p.sqm ? ` (${p.sqm}sqm)` : '';

        const propertyMsg =
          `Property ${i + 1} of ${properties.length}\n\n` +
          (p.project ? `${p.project}\n` : '') +
          `${p.name}\n\n` +
          `Location: ${p.location}\n` +
          `Price: ${p.price}\n` +
          (sizeText ? `Size: ${sizeText}${sqmText}\n` : '') +
          (p.completion ? `Completion: ${p.completion}\n` : '') +
          `Address: ${p.address}` +
          (p.description ? `\n\n${p.description}` : '');

        await sendMessage(from, propertyMsg, p.photo || null);
        if (i < properties.length - 1) await delay(3000);
      }
    }
  } catch (err) {
    console.error('Webhook error:', err);
    await sendMessage(from, 'Sorry, something went wrong. Please try again in a moment.');
  }
});

module.exports = router;