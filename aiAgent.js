const Anthropic = require('@anthropic-ai/sdk');
const tools = require('./tools');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const KNOWLEDGE_BASE = require('./knowledgeBase');

const SYSTEM_PROMPT = `CRITICAL FORMATTING RULE: Never use asterisks (*), underscores (_), tildes (~), backticks, or any markdown formatting in your messages. WhatsApp displays these as literal characters and it looks unprofessional. Write in plain natural text only. No bullet points. No bold. No headers. No numbered lists unless presenting time slots or property options.

You are Nina, a professional and warm property sales assistant for Sydia Realty, a premium real estate company in Nairobi, Kenya.

Your job is to help clients find properties, answer questions about Sydia and the investment process, handle objections naturally, and schedule property viewings. You have access to a company knowledge base injected separately — use it freely for general questions. For all property data, always use tools.

TONE AND VOICE
Be warm and confident but never arrogant. Professional but approachable — like a trusted friend who happens to know real estate deeply. Honest and transparent. Educational — help the client understand, do not just sell. Never sound corporate or scripted. Never use pressure language like "act now", "limited time only", or "do not miss out". Never overclaim on returns or guarantees. Use clear simple English. If a client greets in Swahili, respond warmly in kind — for example "Habari" gets "Safi! How can I help?" — but do not force Swahili. Be honest about Sydia being a growing brand. Credibility comes from the process and track record, not from sounding big.

Good tone example: "That is a valid concern — a lot of people feel that way at first. Here is how Sydia handles it."
Bad tone example: "Do not miss this amazing opportunity! Act now before prices go up!"

SYDIA REALTY POSITIONING
Sydia guides clients — they do not just sell. The goal is to simplify property investment decisions. Clients spend 3 to 12 months researching before deciding. Many are skeptical, overwhelmed, or have been burned before. Your job is to be the trusted advisor who cuts through the noise and gives real information. "We guide, not just sell."

WHAT YOU MUST ALWAYS DO
Ask qualifying questions before sharing properties — never send details without understanding the client first. Explain the WHY behind every property recommendation. Set clear next steps at the end of every interaction. Use the client name once you have it. Reference that Sydia only works with developers they would invest in themselves. Reference that Sydia handles the full journey from KRA PIN to keys.

WHAT YOU MUST NEVER DO
Never quote exact unit prices without the property catalogue — prices change. Never promise specific ROI percentages or guaranteed returns. Never share commission details or internal business information. Never discuss competitor agencies or speak negatively about any company. Never share developer contact details directly — all contact goes through Sydia. Never make legal or tax commitments — refer to lawyers and advisors. Never pressure a client to decide. Never share information about other clients. Never send property details before understanding what the client needs.

ABOUT THE CLIENT'S PHONE NUMBER
You already know the client's WhatsApp number from the system. Never ask for it.

FIRST THING TO DO
If you do not know the client's name yet, ask for it naturally in your first response. Once you have it, immediately call update_lead with their name.

COLLECTING CLIENT INFORMATION — PROGRESSIVE
Collect information naturally through the conversation, never as a form or survey. Prioritize what unlocks value at each stage.

Phase 1 — collect first because these unlock property search:
name, budget, location, bedrooms, interest (Buy or Rent)
Call update_lead as soon as you learn each one.

Phase 2 — collect naturally after showing properties when client shows interest:
purpose (investment or personal home), timeline, payment_method

Phase 3 — collect when client is close to booking or being handed off:
client_type (diaspora or local), decision_maker

Phase 4 — collect during or after escalation:
lead_source (how they heard about Sydia)

If a client volunteers information like "I am in London" or "this is for investment" — infer it and call update_lead silently without making it obvious. Only ask for information you genuinely need right now. Never ask multiple qualifying questions at once.

UNDERSTANDING CLIENT TYPES
Diaspora clients (UK, US, Gulf, Canada): Common fears are distance, not being able to visit, trusting developers remotely, information overload. Reassure them that Sydia handles everything remotely and has helped hundreds of diaspora investors. Offer virtual tours. They value trust and clear process over speed.
Local clients (Nairobi and surrounding areas): Often price-sensitive, comparison shopping, skeptical about off-plan, concerned about payment ability. Reassure them about flexible payment plans and Sydia's vetting process.
Both types spend months researching. Be patient and educational. They are not in a rush and should not feel pushed.

ALWAYS VERIFY BEFORE RESPONDING — CRITICAL
Before telling a client what is or is not available, always call search_properties or get_locations to confirm. Never rely on conversation memory for availability. Never answer "do you have X?" without calling a tool first. Never say "we have properties in Kilimani" unless a tool just returned that. The inventory injected into your context gives awareness — it does not replace live tool verification.

DO NOT SPEAK BEFORE TOOL CALL
If a user gives enough filters to search — call search_properties immediately. Do not describe, promise, or hint at what might be available before the tool runs. If a tool is needed, call it. Do not say "let me check" — just call it.

ANTI-HALLUCINATION — NEVER BREAK THESE
Never invent, guess, or assume any property data. Never say "I have" or "we have" unless a tool has just returned that data in this conversation. Never present properties you have not fetched from the database in this conversation. If a tool returns nothing, say so honestly. Never reference property details, prices, or availability from memory.

HOW TO SEARCH
Before calling search_properties, try to have interest, location, bedrooms, and budget. Once you have enough, call immediately. When a client changes criteria — different location, bedrooms, or budget — search again with new criteria. When they ask about something already discussed in this conversation, answer from conversation history.

WHEN NO PROPERTIES ARE FOUND
Tell the client honestly. Use the suggestion data returned by the tool to guide alternatives — available bedroom counts and price ranges. Offer to adjust criteria. Never invent alternatives.

WHEN PRESENTING PROPERTIES
After calling search_properties, write a short warm message ending with "see the details below" or "take a look below". The property cards follow your message automatically. Keep your message short. Do not list property details in your text.

MULTI-LOCATION SEARCHES
When a client asks for properties in two or more locations, call search_properties separately for each location. Results combine automatically into one numbered list. Write one short message like "I found properties in both Kilimani and Westlands — see the details below."

PROPERTY NUMBER TO ID MAPPING
When a client refers to properties by number — "property 1", "number 5", "the first and fifth one" — map these to the exact UUIDs from the search results in this conversation. Never invent IDs like "property1_id". If you cannot find the UUID, call search_properties again to retrieve the results.

BOOKING FLOW
When a client wants to book: confirm which property, call get_available_slots, present times naturally, when they select a time call create_booking immediately, confirm warmly. When a client picks a time like "second option" or "Saturday 12pm" or "the last one" — map to the slot number and call create_booking immediately.

MULTIPLE PROPERTY BOOKINGS
Get slots for all properties first. Present available times together. Book each property with a different time slot. After a slot is used for one property it is no longer available for the next. When a slot conflict occurs, offer the next available slot for that property only. Do not re-book confirmed properties.

BOOKING RETRY
If create_booking fails because a slot is taken, immediately call get_available_slots again and present fresh options. Never tell the client a slot is taken without immediately offering alternatives.

CANCELLATIONS
If a client says they want to cancel, call cancel_booking immediately. Confirm warmly and let them know the agent has been notified.

ESCALATION — CALL escalate_to_agent TOOL IMMEDIATELY WHEN
Client wants a virtual tour or physical site visit. Client asks to speak with an agent on the phone. Client is ready to reserve, wants an offer letter, or is ready to pay a deposit. Complex legal or tax questions. Any complaint or dissatisfaction. Mortgage eligibility or detailed financing questions. Existing client asking about their current property or payment plan.

When escalating say warmly: "Let me connect you with our team who can help you with this. They will be in touch with you shortly." Then call escalate_to_agent immediately. Do not try to handle these situations yourself.

HANDLING EDGE CASE CLIENTS
Vague client ("just browsing", "not sure yet"): Do not push. Ask one gentle question to understand their situation. Be patient. Many clients browse for months before deciding.
Silent client (sends very short messages, one word replies): Keep responses shorter. Match their energy. Do not overwhelm with information.
Skeptical client ("I have heard bad stories"): Validate their concern immediately. Acknowledge it is real. Then explain what Sydia does differently — vetting process, completed projects, track record.
Comparison shopper ("I am looking at other agencies too"): Do not badmouth competitors. Reinforce what makes Sydia unique — curation, vetting, full journey support.

AFTER-VIEWING CONVERSATIONS
When clients message after a viewing: "it was amazing, we want to proceed" — mark as Hot Lead and say the agent will be in touch. "We made an offer" — congratulate warmly, mark as Hot Lead. "Not really what we were looking for" — empathize, ask what did not work, offer alternatives. "Still thinking" — offer to help with questions, share more information, be patient.

RETURNING CLIENTS
You will receive a CLIENT PROFILE with everything known about this person. Use it immediately. Never ask for information already in the profile. When a client returns after a break you will also receive a PREVIOUS SESSION SUMMARY — use it to acknowledge what happened and ask what they need today.

CONVERSATION STATE
properties_shown — properties have been shown, do not search again unless criteria changed.
selecting_slot — client chose a property, use the CURRENT SELECTED PROPERTY ID directly for create_booking.
booking_confirmed — booking exists, focus on answering questions or handling changes.

TOOL USAGE
Use tools whenever you need real data. Maximum one or two tool calls per turn where possible. Trust your judgment based on the conversation. Call tools when you need live data. Answer from conversation history when the information is already there.

FAILURE HANDLING
If a tool fails or returns nothing, be honest. Offer the next step — adjust search or escalate to the agent. Never guess.

IMPORTANT
You work exclusively for Sydia Realty. All property data must come from tools. Company knowledge comes from the injected knowledge base. If something is not in the database, say so honestly.

AFTER TOOL USE
After calling any tool, you must always send a final message to the client. Never end your turn silently after a tool call. If you just saved someone's name, respond warmly and continue the conversation. Example: after saving "Cecil", say something like "Nice to meet you Cecil! Are you looking to buy or rent, and do you have a location in mind?"`;

// ============================================
// TOOL DEFINITIONS FOR CLAUDE
// ============================================
const TOOL_DEFINITIONS = [

  

  {
    name: 'get_locations',
    description: 'Get available property locations/areas from the database. Call this when the client asks about areas or when you need to show available locations.',
    input_schema: {
      type: 'object',
      properties: {
        interest: {
          type: 'string',
          description: 'Property type: Buy or Rent'
        }
      },
      required: ['interest']
    }
  },
  {
    name: 'get_bedroom_options',
    description: 'Get available bedroom counts for a specific location. Call this after the client has chosen a location.',
    input_schema: {
      type: 'object',
      properties: {
        interest: { type: 'string', description: 'Property type: Buy or Rent' },
        location: { type: 'string', description: 'The area the client is interested in' }
      },
      required: ['interest', 'location']
    }
  },
  {
    name: 'get_completion_dates',
    description: 'Get available offplan completion dates filtered by client preferences. Call this when client wants offplan properties.',
    input_schema: {
      type: 'object',
      properties: {
        interest: { type: 'string' },
        location: { type: 'string' },
        bedrooms: { type: 'number', description: 'Number of bedrooms, optional' },
        budget: { type: 'number', description: 'Budget in KES, optional' }
      },
      required: ['interest', 'location']
    }
  },
  {
    name: 'search_properties',
    description: 'Search for properties matching client criteria. Always call this before presenting any properties. Never guess or invent property details.',
    input_schema: {
      type: 'object',
      properties: {
        interest: { type: 'string', description: 'Buy or Rent' },
        location: { type: 'string', description: 'Area name' },
        bedrooms: { type: 'number', description: 'Number of bedrooms' },
        budget: { type: 'number', description: 'Budget in KES' },
        isOffplan: { type: 'boolean', description: 'true for offplan, false for ready, omit if not specified' },
        completionDate: { type: 'string', description: 'Completion date filter for offplan, e.g. 2028' }
      },
      required: ['interest', 'location']
    }
  },
  
  {
    name: 'get_available_slots',
    description: 'Get available viewing time slots for a property. IMPORTANT: The propertyId must be the exact UUID from the search_properties results. Never invent or guess a property ID.',
    input_schema: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'The exact property UUID returned by search_properties. Example: "fafc336e-5ad7-4870-9209-76731b69566f"'
        }
      },
      required: ['propertyId']
    }
  },

   {
    name: 'create_booking',
    description: 'Create a confirmed viewing booking. IMPORTANT: propertyId must be the exact UUID from search_properties results. slotNumber must be the number the client chose from get_available_slots.',
    input_schema: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'Exact property UUID from search_properties results'
        },
        slotNumber: {
          type: 'number',
          description: 'The slot number chosen by the client from get_available_slots'
        },
        leadName: {
          type: 'string',
          description: 'Client name'
        }
      },
      required: ['propertyId', 'slotNumber']
    }
  },

  {
    name: 'cancel_booking',
    description: 'Cancel the client\'s most recent active viewing booking. Call this when the client says they want to cancel. It removes the calendar event and notifies the agent.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

  {
    name: 'update_lead',
    description: 'Save client information to the CRM database. Call this whenever you learn the client name, budget, interest, location, or bedroom preference. The lead ID is handled automatically by the system — never include it as a parameter.',
    input_schema: {
      type: 'object',
      properties: {
        fields: {
          type: 'object',
          description: 'Fields to update. Use these exact key names: name, budget, interest, location, size, status, is_offplan, completion_range',
          properties: {
            name: { type: 'string', description: 'Client full name' },
            budget: { type: 'number', description: 'Budget in KES as a number e.g. 15000000' },
            interest: { type: 'string', description: 'Buy or Rent' },
            location: { type: 'string', description: 'Area name e.g. Westlands' },
            size: { type: 'string', description: 'e.g. 2 bedroom or Studio' },
            is_offplan: { type: 'boolean' },
            completion_range: { type: 'string' },
            status: { type: 'string' },
            purpose: { type: 'string', description: 'Investment or personal home' },
            payment_method: { type: 'string', description: 'Cash, installments, or mortgage' },
            timeline: { type: 'string', description: 'When they are ready e.g. immediately, 3 months, 6 months, just exploring' },
            decision_maker: { type: 'string', description: 'Just them, spouse, partner, family' },
            client_type: { type: 'string', description: 'diaspora or local' },
            lead_source: { type: 'string', description: 'How they heard about Sydia Realty' }
          }
        }
      },
      required: ['fields']
    }
  },

  {
    name: 'escalate_to_agent',
    description: 'Hand off the client to a human agent. Call this when the client wants a virtual tour, is ready to invest, wants to speak to someone, has a complaint, or asks complex legal or mortgage questions. This notifies the agent immediately via WhatsApp.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason for escalation e.g. "Client ready to invest", "Wants virtual tour", "Mortgage question"'
        }
      },
      required: ['reason']
    }
  },
];

// ============================================
// EXECUTE TOOL CALL
// ============================================
async function executeTool(toolName, toolInput, context) {
  context.toolCallsThisTurn += 1;

  if (context.toolCallsThisTurn > 6) {
    console.warn('Tool call limit reached — forcing stop');
    return { error: 'Too many tool calls in one turn. Please ask the client to clarify their request.' };
  }
  
  console.log(`Tool called: ${toolName}`);

  switch (toolName) {

    case 'get_locations': {
      return await tools.getLocations(toolInput.interest);
    }

    case 'get_bedroom_options': {
      return await tools.getBedroomOptions(toolInput.interest, toolInput.location);
    }

    case 'get_completion_dates': {
      return await tools.getCompletionDates(
        toolInput.interest,
        toolInput.location,
        toolInput.bedrooms || null,
        toolInput.budget || null
      );
    }
case 'search_properties': {
      const result = await tools.searchProperties(toolInput);

      if (result.properties && result.properties.length > 0) {

        // If this is an active session (properties already shown before),
        // only allow new results if the user explicitly asked for different criteria
        // We detect this by checking if the search intent differs from what was previously saved
        if (context.isActiveSession) {
          const incomingLocation = toolInput.location?.toLowerCase().trim();
          const incomingBedrooms = toolInput.bedrooms;
          const incomingInterest = toolInput.interest?.toLowerCase().trim();

          const savedLocation = context.savedLocation?.toLowerCase().trim();
          const savedBedrooms = context.savedSize;
          const savedInterest = context.savedInterest?.toLowerCase().trim();

          const criteriaChanged =
            (incomingInterest && savedInterest && incomingInterest !== savedInterest) ||
            (incomingBedrooms !== undefined && savedBedrooms !== null && incomingBedrooms !== savedBedrooms);

          if (!criteriaChanged) {
            // Same criteria as before — accumulate for re-send but mark as resend
            console.log('Re-search with same criteria — accumulating for re-send');
            context.isActiveSession = false; // Allow this re-send
          }
        }

        // ALWAYS accumulate — never overwrite
        // Deduplicate by ID to handle multi-location searches cleanly
        const existingIds = new Set(context.newPropertiesThisTurn.map(p => p.id));

        const newOnes = result.properties
          .filter(p => !existingIds.has(p.id))
          .map((p, i) => ({
            ...p,
            number: context.newPropertiesThisTurn.length + i + 1
          }));

        context.newPropertiesThisTurn.push(...newOnes);

        console.log(`Accumulated ${newOnes.length} new properties. Total this turn: ${context.newPropertiesThisTurn.length}`);

        // Auto-select if only one property total
        if (context.newPropertiesThisTurn.length === 1) {
          context.currentPropertyId = context.newPropertiesThisTurn[0].id;
          console.log('Single property auto-selected:', context.currentPropertyId);
        }

        // Update foundPropertyIds from full accumulated list
        context.foundPropertyIds = context.newPropertiesThisTurn.map(p => ({
          number: p.number,
          id: p.id,
          name: p.name
        }));

        // Save preferences
        const preferencesToSave = {};
        if (toolInput.interest) preferencesToSave.interest = toolInput.interest;
        if (toolInput.location) preferencesToSave.location = toolInput.location;
        if (toolInput.bedrooms !== undefined) preferencesToSave.size = `${toolInput.bedrooms} bedroom`;
        if (toolInput.budget) preferencesToSave.budget = toolInput.budget.toString();
        preferencesToSave.conversation_stage = 'properties_shown';

        await tools.updateLead(context.leadId, preferencesToSave);

        // Update context saved state
        context.savedLocation = toolInput.location || context.savedLocation;
        context.savedSize = toolInput.bedrooms !== undefined ? toolInput.bedrooms : context.savedSize;
        context.savedBudget = toolInput.budget !== undefined ? toolInput.budget : context.savedBudget;
        context.savedInterest = toolInput.interest || context.savedInterest;
      }

      return result;
    }

    case 'get_available_slots': {
  const result = await tools.getAvailableSlots(toolInput.propertyId);

  if (result.slotMap) {
    context.currentSlotMap = JSON.stringify(result.slotMap);

    // IMPORTANT: verify against known properties in context
    const validProperty = (context.newPropertiesThisTurn || [])
      .find(p => p.id === toolInput.propertyId);

    const updateFields = {
      available_slots: JSON.stringify(result.slotMap)
    };

    if (validProperty) {
      context.currentPropertyId = toolInput.propertyId;
      updateFields.selected_property_id = toolInput.propertyId;
      updateFields.conversation_stage = 'selecting_slot';
    } else {
      console.warn(
        'Rejected invalid property selection:',
        toolInput.propertyId
      );
    }

    await tools.updateLead(context.leadId, updateFields);
  }

  return result;
}

    case 'create_booking': {
      const bookingInput = {
        leadId: context.leadId,
        propertyId: toolInput.propertyId || context.currentPropertyId,
        slotNumber: toolInput.slotNumber,
        slotMap: toolInput.slotMap || context.currentSlotMap,
        leadName: context.leadName || toolInput.leadName || 'Client', // Server enforces this
        leadPhone: context.leadPhone
      };

      console.log('Booking input:', JSON.stringify(bookingInput));

      if (!bookingInput.propertyId) {
        return { success: false, error: 'Missing property ID. Please confirm which property the client wants to book.' };
      }

      if (!bookingInput.slotMap) {
        return { success: false, error: 'No slot map available. Please get available slots first.' };
      }

      const result = await tools.createBooking(bookingInput);

      // Validate property ID is a real UUID — reject placeholders like "property1_id"
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!bookingInput.propertyId || !uuidPattern.test(bookingInput.propertyId)) {
        console.error('Invalid property ID rejected:', bookingInput.propertyId);
        return {
          success: false,
          error: `Invalid property ID "${bookingInput.propertyId}". You must use the exact UUID from the search results. Check the PROPERTIES ALREADY SHOWN section in your context.`
        };
      }

      if (result.success) {
        context.completedBookings += 1;
        await tools.updateLead(context.leadId, {
          conversation_stage: 'booking_confirmed'
        });
        console.log('Stage updated to booking_confirmed');
        console.log('Completed bookings this turn:', context.completedBookings);
      }

      return result;
    }

    case 'cancel_booking': {
      return await tools.cancelBooking(context.leadId);
    }

    case 'update_lead': {
      const id = context.leadId;
      if (!id) return { success: false, error: 'No lead ID' };

      if (toolInput.fields?.name) context.leadName = toolInput.fields.name;

      const safeFields = { ...toolInput.fields };
      delete safeFields.leadId;
      delete safeFields.bedrooms;

      return await tools.updateLead(id, safeFields);
    }

    case 'escalate_to_agent': {
      return await tools.escalateToAgent(context.leadId, toolInput.reason);
    }

    default:
      console.error(`Unknown tool: ${toolName}`);
      return { error: `Unknown tool: ${toolName}` };
  }
}

function buildClientProfile(lead, sessionSummary) {
  let profile = '\n\nCLIENT PROFILE (from database):\n';

  if (lead.name) {
    profile += `Name: ${lead.name}\n`;
    profile += `This is a returning client. Greet them by name. Do not ask for their name again.\n`;
  } else {
    profile += `Name: Unknown — ask for name naturally in your first response.\n`;
  }

  if (lead.interest) profile += `Interest: ${lead.interest}\n`;
  if (lead.location) profile += `Location: ${lead.location}\n`;
  if (lead.budget) {
    const budgetNum = Number(lead.budget);
    if (!isNaN(budgetNum) && budgetNum > 0) {
      profile += `Previous budget: KES ${budgetNum.toLocaleString()}\n`;
    }
  }
  if (lead.size) profile += `Size preference: ${lead.size}\n`;
  if (lead.status) profile += `Status: ${lead.status}\n`;
  if (lead.conversation_stage) profile += `Current stage: ${lead.conversation_stage}\n`;

  if (sessionSummary) {
    profile += `\nPREVIOUS SESSION SUMMARY:\n${sessionSummary}\n`;
    profile += `This client is returning after a break. Acknowledge naturally and ask what they need today.\n`;
  }

  profile += `\nNever ask for information already in this profile.\n`;

  return profile;
}

// ============================================
// MAIN: Process message through AI
// ============================================
async function processMessage({ userMessage, lead, conversationHistory, sessionSummary }) {
  const cleanPhone = lead.phone?.replace('whatsapp:', '').trim();

  const isActiveSession = ['properties_shown', 'selecting_slot', 'booking_confirmed']
    .includes(lead.conversation_stage);

  const context = {
    leadId: lead.id,
    leadName: lead.name || null,
    leadPhone: cleanPhone,
    currentSlotMap: lead.available_slots || null,
    currentPropertyId: lead.selected_property_id || null,
    newPropertiesThisTurn: [],  // Always start empty — accumulates during this message only
    foundPropertyIds: [],
    isActiveSession,             // True if properties were already shown in a previous message
    savedLocation: lead.location || null,
    savedSize: typeof lead.size === 'string' ? parseInt(lead.size, 10) || null : lead.size,
    savedBudget: lead.budget ? Number(lead.budget) : null,
    savedInterest: lead.interest || null,
    completedBookings: 0,
    toolCallsThisTurn: 0
  };

  console.log('Processing message for lead:', lead.id, '| Phone:', cleanPhone);

  // Load inventory from database
  let availableOptionsContext = '';
  try {
    const options = await tools.getAvailableOptions();
    if (options && options.locationSummary && options.locationSummary.length > 0) {
      // Filter out Land — Sydia Realty only deals in Buy and Rent
      const filteredTypes = (options.types || []).filter(t => t !== 'Land');

      const locationDetails = options.locationSummary.map(loc =>
        `  ${loc.location}: ${loc.bedrooms.join(', ')} | ${loc.priceRange} | ${loc.hasOffplan && loc.hasReady ? 'offplan + ready' : loc.hasOffplan ? 'offplan only' : 'ready only'}`
      ).join('\n');

      availableOptionsContext =
        `\n\nCURRENT DATABASE INVENTORY:\n` +
        `Types: ${filteredTypes.join(', ')}\n` +
        `Price range: ${options.overallPriceRange}\n` +
        `\nBy location:\n${locationDetails}\n` +
        `\nOnly suggest what is in this inventory. Never use outside knowledge.`;
    }
  } catch (err) {
    console.error('Failed to load inventory:', err.message);
  }

  // Fallback protection if inventory failed to load
  if (!availableOptionsContext) {
    availableOptionsContext = '\n\nInventory temporarily unavailable. Rely strictly on tool calls to confirm what is available. Do not guess or assume anything.';
  }

  // Build client profile from database — this is Claude's long term memory
  const clientProfile = buildClientProfile(lead, sessionSummary);

  const safeHistory = Array.isArray(conversationHistory) ? conversationHistory : [];

  const messages = [
    ...safeHistory.map(h => ({
      role: h.role,
      content: typeof h.content === 'string' ? h.content : JSON.stringify(h.content)
    })),
    { role: 'user', content: userMessage }
  ];

  // Inject current property context so Claude never needs to re-search for IDs
  let propertyContext = '';
  if (['selecting_slot', 'booking_confirmed'].includes(lead.conversation_stage)) {
    if (lead.selected_property_id) {
      propertyContext = `\n\nCURRENT SELECTED PROPERTY:\nProperty ID: ${lead.selected_property_id}\nUse this ID directly for get_available_slots and create_booking. Do not call search_properties again.`;
    }
  }

  const systemContext = SYSTEM_PROMPT + availableOptionsContext + KNOWLEDGE_BASE + clientProfile + propertyContext;

  let finalText = null;
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`--- AI iteration ${iterations} ---`);

    let response;
    try {
      response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemContext,
        tools: TOOL_DEFINITIONS,
        messages: messages
      });
    } catch (err) {
      console.error('Claude API error:', err.message);
      return { text: 'Sorry, I am having trouble right now. Please try again.', properties: null };
    }

    console.log('Stop reason:', response.stop_reason);

    if (!response || !Array.isArray(response.content)) {
      console.error('Unexpected API response structure:', JSON.stringify(response));
      break;
    }

    console.log('Content blocks:', response.content.map(b => b.type).join(', '));

    if (response.stop_reason === 'end_turn') {
      for (const block of response.content) {
        if (block.type === 'text' && block.text?.trim()) {
          finalText = block.text;
          break;
        }
      }
      break;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        console.log(`Executing tool: ${block.name}`, JSON.stringify(block.input));

        let result;
        try {
          result = await executeTool(block.name, block.input, context);
          console.log(`Result:`, JSON.stringify(result).substring(0, 200));
        } catch (err) {
          console.error(`Tool error:`, err.message);
          result = { error: err.message };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result)
        });
      }

      messages.push({ role: 'user', content: toolResults });

      // If multiple bookings completed this turn, force a final message
      // This prevents hitting MAX_ITERATIONS without Claude getting to speak
      if (context.completedBookings >= 2) {
        console.log('Multiple bookings completed — forcing final confirmation message');
        finalText =
          `You are all set ${context.leadName || ''}! Both viewings are confirmed. ` +
          `Your agent will be in touch with the details for each one. ` +
          `Let me know if you need anything else!`;
        break;
      }

      continue;
    }

    break;
  }

  console.log('AI final text:', finalText?.substring(0, 100));
  console.log('Tool called this turn:', context.newPropertiesThisTurn ? 'YES — properties found' : 'NO tool result');

  if (finalText?.toLowerCase().includes('i found') && !context.newPropertiesThisTurn) {
    console.warn('POSSIBLE HALLUCINATION: Claude claimed to find properties without calling search tool');
  }

  if (finalText?.toLowerCase().includes('we have') && !context.newPropertiesThisTurn) {
    console.warn('POSSIBLE HALLUCINATION: Claude claimed availability without calling search tool');
  }

  // If Claude ended turn with no text after a tool call, provide a contextual fallback
  if (!finalText || finalText.trim().length === 0) {
    const leadName = context.leadName || '';
    if (leadName) {
      finalText = `Nice to meet you ${leadName}! What are you looking for today? Are you interested in buying or renting, and do you have a location or budget in mind?`;
    } else {
      finalText = 'Thanks for that. How can I help you today?';
    }
    console.log('Empty AI response detected — using contextual fallback');
  }

  return {
    text: finalText,
    // Only send property cards if we accumulated new properties this turn
    properties: context.newPropertiesThisTurn && context.newPropertiesThisTurn.length > 0
      ? context.newPropertiesThisTurn
      : null
  };
}

module.exports = { processMessage };