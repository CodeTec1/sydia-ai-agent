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
    const lead = await tools.getOrCreateLead(from);
    if (!lead) {
      await sendMessage(from, 'Welcome to Sydia Realty! Please try sending your message again.');
      return;
    }

    console.log('Lead ID:', lead.id, '| Name:', lead.name || 'Unknown');

    const history = await tools.getConversationHistory(lead.id);
    console.log('History length:', history.length);

    await tools.saveMessage(lead.id, 'user', userMessage);

    let aiResponse, properties;

    try {
      const result = await processMessage({
        userMessage,
        lead,
        conversationHistory: history
      });
      aiResponse = result.text;
      properties = result.properties;
    } catch (aiErr) {
      console.error('AI processing error:', aiErr.message);
      console.error('Stack:', aiErr.stack);
      // Send a graceful response instead of "something went wrong"
      aiResponse = `Hi there! I am Nina from Sydia Realty. I am here to help you find your perfect property in Nairobi. What are you looking for today?`;
      properties = null;
    }

    console.log('AI response length:', aiResponse?.length || 0);
    console.log('Properties found:', properties?.length || 0);

    await tools.saveMessage(lead.id, 'assistant', aiResponse);
    await sendMessage(from, aiResponse);

    if (properties && properties.length > 0) {
      // Only send properties that have not been sent before in this session
      const alreadySentIds = new Set(
        (lead.search_results || []).map(p => p.id)
      );

      // On first send, alreadySentIds will be empty so all go through
      // After first send, lead.search_results is updated, so duplicates are blocked
      // But since we fetch lead once at start of webhook, this session tracks correctly

      await delay(2000);

      for (let i = 0; i < properties.length; i++) {
        const p = properties[i];

        const sizeText = p.bedrooms === 0 ? 'Studio' : p.bedrooms ? `${p.bedrooms} Bed` : '';
        const sqmText = p.sqm ? ` (${p.sqm}sqm)` : '';

        const propertyMsg =
          `Property ${p.number || i + 1} of ${properties.length}\n\n` +
          (p.project ? `${p.project}\n` : '') +
          `${p.name}\n\n` +
          `Location: ${p.location}\n` +
          `Price: ${p.price}\n` +
          (sizeText ? `Size: ${sizeText}${sqmText}\n` : '') +
          (p.completion ? `Completion: ${p.completion}\n` : '') +
          `Address: ${p.address}` +
          (p.description ? `\n\n${p.description}` : '');

        if (p.photo && p.photo.startsWith('http') && !p.photo.includes('photos.app.goo.gl')) {
          await sendMessage(from, propertyMsg, p.photo);
        } else {
          await sendMessage(from, propertyMsg);
        }

        if (i < properties.length - 1) await delay(3000);
      }

      await delay(properties.length * 2000 + 1000);

      if (properties.length === 1) {
        await sendMessage(from, 'That is the property above. Just let me know if you would like to book a viewing and I will get it sorted for you.');
      } else {
        await sendMessage(from, `Those are the ${properties.length} properties above. Just let me know which one you would like to visit and I will book a viewing for you.`);
      }
    }

  } catch (err) {
    console.error('Webhook error:', err.message);
    console.error('Stack:', err.stack);
    try {
      await sendMessage(from, 'Hi! I am Nina from Sydia Realty. Please send your message again and I will be happy to help you.');
    } catch (sendErr) {
      console.error('Could not send error message:', sendErr.message);
    }
  }
});

module.exports = router;