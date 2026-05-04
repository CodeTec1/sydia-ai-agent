const supabase = require('./supabase');
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

function sanitizeForWhatsApp(text) {
  if (!text) return text;
  // Remove markdown that WhatsApp displays as literal characters
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')  // bold
    .replace(/\*(.*?)\*/g, '$1')       // italic
    .replace(/_(.*?)_/g, '$1')         // underscore italic
    .replace(/`(.*?)`/g, '$1')         // inline code
    .replace(/#{1,6}\s/g, '')          // headers
    .trim();
}

router.post('/', async (req, res) => {
  const from = req.body.From;
  const userMessage = req.body.Body?.trim();

  if (!from || !userMessage) {
    return res.status(200).send('<Response></Response>');
  }

  //  spam protection
  if (userMessage.length > 1000) {
    console.log('Message too long, ignoring:', from);
    return res.status(200).send('<Response></Response>');
  }

  console.log(`\n========================================`);
  console.log(`Message from ${from}: ${userMessage}`);
  console.log(`========================================`);

  res.status(200).send('<Response></Response>');

  try {
    const lead = await tools.getOrCreateLead(from);
    if (!lead) {
      await sendMessage(from, 'Welcome to Sydia Realty! Please try again.');
      return;
    }

    console.log('Lead ID:', lead.id, '| Name:', lead.name || 'Unknown');

    let history = await tools.getConversationHistory(lead.id);
    let sessionSummary = null;
    const previousNotes = lead.notes || null;

    // Detect new session — more than 6 hours since last message
    if (history.length > 0) {
      const lastMessage = history[history.length - 1];
      const lastMessageTime = new Date(lastMessage.created_at || Date.now());
      const hoursSince = (Date.now() - lastMessageTime.getTime()) / (1000 * 60 * 60);

      if (hoursSince > 6) {
        console.log(`New session detected — ${Math.round(hoursSince)} hours since last message`);

        // Generate summary of previous session before clearing
        sessionSummary = await tools.generateSessionSummary(history);
        console.log('Session summary:', sessionSummary);

        // Save summary to lead notes for future sessions
        if (sessionSummary) {
          await supabase
            .from('leads')
            .update({ notes: sessionSummary })
            .eq('id', lead.id);
        }

        // Clear session data from lead — temporary data, not long term memory
        await supabase
          .from('leads')
          .update({
            search_results: null,
            available_slots: null,
            selected_property_id: null
          })
          .eq('id', lead.id);

        // Clear local lead object to match
        lead.search_results = null;
        lead.available_slots = null;
        lead.selected_property_id = null;

        // Clear conversation history for fresh session
        await tools.clearConversationHistory(lead.id);
        history = [];

        console.log('Session cleared. Starting fresh with client profile.');
      }
    }

    console.log('History length:', history.length);

    await tools.saveMessage(lead.id, 'user', userMessage);

    let aiResponse, properties;

    try {
      const result = await processMessage({
        userMessage,
        lead,
        conversationHistory: history,
        sessionSummary: sessionSummary || previousNotes
      });
      aiResponse = result.text || 'Hi, I am Nina from Sydia Realty. How can I help you today?';
      properties = result.properties;
    } catch (aiErr) {
      console.error('AI processing error:', aiErr.message);
      console.error('Stack:', aiErr.stack);
      aiResponse = 'Hi! I am Nina from Sydia Realty. I am here to help you find your perfect property in Nairobi. What are you looking for today?';
      properties = null;
    }

    console.log('AI response length:', aiResponse?.length || 0);
    console.log('Properties found:', properties?.length || 0);

    const cleanResponse = sanitizeForWhatsApp(aiResponse);
    await tools.saveMessage(lead.id, 'assistant', cleanResponse);
    await sendMessage(from, cleanResponse);

    if (properties && properties.length > 0) {
      await delay(2000);

      // Log first property to confirm field mapping is correct
      if (properties.length > 0) {
        console.log('Property sample:', JSON.stringify(properties[0]));
      }

      for (let i = 0; i < properties.length; i++) {
        try {
          const p = properties[i];

          const sizeText = p.bedrooms === 0 ? 'Studio' : p.bedrooms ? `${p.bedrooms} Bed` : '';
          const sqmText = p.sqm ? ` (${p.sqm}sqm)` : '';

          const priceDisplay = typeof p.price === 'number'
            ? `KES ${Number(p.price).toLocaleString()}`
            : (p.price?.toString().startsWith('KES') ? p.price : `KES ${Number(p.price || p.rawPrice || 0).toLocaleString()}`);

          const propertyMsg =
            `Property ${p.number || i + 1} of ${properties.length}\n\n` +
            (p.project ? `${p.project}\n` : '') +
            `${p.name}\n\n` +
            `Location: ${p.location}\n` +
            `Price: ${priceDisplay}\n` +
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
        } catch (sendErr) {
          console.error(`Failed to send property ${i + 1}:`, sendErr.message);
        }
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