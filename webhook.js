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

async function sendMessage(to, body, mediaUrl = null) {
  try {
    const options = { from: SYDIA_WHATSAPP, to, body };
    if (mediaUrl) options.mediaUrl = [mediaUrl];
    await twilioClient.messages.create(options);
  } catch (err) {
    console.error('Send message error:', err.message);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

router.post('/', async (req, res) => {
  const from = req.body.From;
  const userMessage = req.body.Body?.trim();

  if (!from || !userMessage) {
    return res.status(200).send('<Response></Response>');
  }

  console.log(`\n========================================`);
  console.log(`Message from ${from}: ${userMessage}`);
  console.log(`========================================`);

  res.status(200).send('<Response></Response>');

  try {
    // Get or create lead
    const lead = await tools.getOrCreateLead(from);
    if (!lead) {
      await sendMessage(from, 'Sorry, something went wrong. Please try again.');
      return;
    }

    console.log('Lead ID:', lead.id, '| Name:', lead.name || 'Unknown');

    // Load conversation history
    const history = await tools.getConversationHistory(lead.id);
    console.log('History length:', history.length);

    // Save user message to history
    await tools.saveMessage(lead.id, 'user', userMessage);

    // Process through AI
    const { text: aiResponse, properties } = await processMessage({
      userMessage,
      lead,
      conversationHistory: history
    });

    console.log('AI response length:', aiResponse.length);
    console.log('Properties found:', properties?.length || 0);

    // Save AI response to history
    await tools.saveMessage(lead.id, 'assistant', aiResponse);

    // Send AI text response
    await sendMessage(from, aiResponse);

    // If properties were found, send property cards with photos
    if (properties && properties.length > 0) {
      await delay(2000);

      for (let i = 0; i < properties.length; i++) {
        const p = properties[i];

        const sizeText = p.bedrooms === 0
          ? 'Studio'
          : p.bedrooms
            ? `${p.bedrooms} Bed`
            : '';
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

        // Try to send with photo, fall back to text only
        if (p.photo && p.photo.startsWith('http') && !p.photo.includes('photos.app.goo.gl')) {
          await sendMessage(from, propertyMsg, p.photo);
        } else {
          await sendMessage(from, propertyMsg);
        }

        if (i < properties.length - 1) await delay(3000);
      }

      // Wait then send summary
      await delay(properties.length * 1500);
      await sendMessage(
        from,
        `I have sent you ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}.\n\nJust let me know which one you would like to visit and I will get a viewing sorted for you.`
      );
    }

  } catch (err) {
    console.error('Webhook error:', err);
    console.error('Stack:', err.stack);
    await sendMessage(from, 'Sorry, something went wrong. Please try again in a moment.');
  }
});

module.exports = router;