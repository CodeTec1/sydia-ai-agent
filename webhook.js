const supabase = require('./supabase');
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { processMessage } = require('./aiAgent');
const tools = require('./tools');

// In-memory deduplication for Twilio webhook retries
const processedMessages = new Set();

// Per-user processing lock
const activeUsers = new Set();

// Clear old entries every hour to prevent memory growth
setInterval(() => processedMessages.clear(), 60 * 60 * 1000);

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
  if (!text) return 'Hi, I am Nina from Sydia Realty. How can I help you today?';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/~(.*?)~/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .trim();
}

router.post('/', async (req, res) => {
  const from = req.body.From;
  const userMessage = req.body.Body?.trim();

  if (!from) {
    return res.status(200).send('<Response></Response>');
  }

  const messageSid = req.body.MessageSid;
  if (messageSid && processedMessages.has(messageSid)) {
    console.log('Duplicate webhook ignored:', messageSid);
    return res.status(200).send('<Response></Response>');
  }
  if (messageSid) processedMessages.add(messageSid);

  if (!userMessage) {
    if (req.body.NumMedia > 0) {
      // User sent a voice note or image — respond politely
      const mediaFrom = from;
      res.status(200).send('<Response></Response>');
      await sendMessage(mediaFrom, 'Hi! I can only read text messages right now. Please type your question and I will be happy to help.');
    } else {
      res.status(200).send('<Response></Response>');
    }
    return;
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

    // Prevent multiple simultaneous requests from same user
if (activeUsers.has(from)) {
  console.log('User already processing:', from);

  await sendMessage(
    from,
    'Just a moment — I am still processing your previous message.'
  );

  return;
}

activeUsers.add(from);

    console.log('Lead ID:', lead.id, '| Name:', lead.name || 'Unknown');

    let history = await tools.getConversationHistory(lead.id);
    let sessionSummary = null;

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
          const existingNotes = lead.notes || '';
          const timestamp = new Date().toLocaleDateString('en-KE');
          const combinedNotes = existingNotes
            ? `${existingNotes}\n\n--- Session ${timestamp} ---\n${sessionSummary}`
            : sessionSummary;

          await supabase
            .from('leads')
            .update({ notes: combinedNotes })
            .eq('id', lead.id);
        }

                // Clear session data from lead — temporary data, not long term memory
        await supabase
          .from('leads')
          .update({
            search_results: null,
            available_slots: null,
            selected_property_id: null,
            conversation_stage: null,
            property_snapshot: null,
            search_fingerprints: null,
            found_property_ids: null
          })
          .eq('id', lead.id);

        // Clear local lead object to match
        lead.search_results = null;
        lead.available_slots = null;
        lead.selected_property_id = null;
        lead.conversation_stage = null;
        lead.property_snapshot = null;
        lead.search_fingerprints = null;
        lead.found_property_ids = null;

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
      const finalSummary = sessionSummary || lead.notes || null;

      const result = await processMessage({
        userMessage,
        lead,
        conversationHistory: history,
        sessionSummary: finalSummary
      });
      aiResponse = result.text?.trim()
      ? result.text
      : 'Hi, I am Nina from Sydia Realty. How can I help you today?';
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

    const truncatedResponse = cleanResponse.length > 1500
      ? cleanResponse.slice(0, 1497) + '...'
      : cleanResponse;

    await tools.saveMessage(lead.id, 'assistant', truncatedResponse);
    await sendMessage(from, truncatedResponse);

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
            try {
              await sendMessage(from, propertyMsg, p.photo);
            } catch {
              await sendMessage(from, propertyMsg);
            }
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

      // Mark properties as shown AFTER they are actually sent to the user
      await supabase
        .from('leads')
        .update({ conversation_stage: 'properties_shown' })
        .eq('id', lead.id);

      console.log('Stage updated to properties_shown after cards sent');

    }

  } catch (err) {
    console.error('Webhook error:', err.message);
    console.error('Stack:', err.stack);
    try {
      await sendMessage(from, 'Hi! I am Nina from Sydia Realty. Please send your message again and I will be happy to help you.');
    } catch (sendErr) {
      console.error('Could not send error message:', sendErr.message);
    }
  } finally {
  activeUsers.delete(from);
}
});

module.exports = router;