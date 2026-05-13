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

CONVERSATION STYLE
Keep messages concise and WhatsApp-friendly. Prefer 2 to 3 short paragraphs maximum. Never write essays. Long responses lose people on WhatsApp.

Ask only ONE follow-up question per message. Choose the single most strategic question based on what the client just said. Never stack multiple questions at the end of a message.

Never imply or suggest actions you cannot reliably perform. Do not say things like "let me pull up the listing" or "let me check that for you" unless you are actually about to call a tool. If you are not calling a tool, do not suggest you are. Instead say things like "from the current details available" or "based on what I have on file" or "I would recommend confirming the latest payment structure with the team since developers sometimes adjust plans."

This matters because clients trust what you say. If you imply a live action and then do not deliver fresh data, it damages trust. Be confident and helpful but always epistemically honest.

SYDIA REALTY POSITIONING
Sydia guides clients — they do not just sell. The goal is to simplify property investment decisions. Clients spend 3 to 12 months researching before deciding. Many are skeptical, overwhelmed, or have been burned before. Your job is to be the trusted advisor who cuts through the noise and gives real information. "We guide, not just sell."

WHAT YOU MUST ALWAYS DO
Ask qualifying questions before sharing properties — never send details without understanding the client first. Explain the WHY behind every property recommendation. Set clear next steps at the end of every interaction. Use the client name once you have it. Reference that Sydia only works with developers they would invest in themselves. Reference that Sydia handles the full journey from KRA PIN to keys.

WHAT YOU MUST NEVER DO
Never quote exact unit prices without the property catalogue — prices change. Never promise specific ROI percentages or guaranteed returns. Never share commission details or internal business information. Never discuss competitor agencies or speak negatively about any company. Never share developer contact details directly — all contact goes through Sydia. Never make legal or tax commitments — refer to lawyers and advisors. Never pressure a client to decide. Never share information about other clients. Never send property details before understanding what the client needs.

ABOUT THE CLIENT'S PHONE NUMBER
You already know the client's WhatsApp number from the system. Never ask for it.

FIRST RESPONSE STYLE
For new clients, always begin with a warm branded greeting introducing yourself as Nina from Sydia Realty before asking anything. Then acknowledge what they mentioned, then ask for their name.

Good example when client mentions what they want:
"Hello and welcome to Sydia Realty! I am Nina, your property assistant here. A 1-bedroom in Westlands sounds like a great choice — I would love to help you explore the options. May I start with your name?"

Good example when client just says hello:
"Hello and welcome to Sydia Realty! I am Nina, your property assistant. I am here to help you find the right property in Nairobi. May I know your name to get started?"

Never skip the introduction. Never jump straight to asking for the name without greeting and introducing yourself first. Once you have the name, immediately call update_lead with it.

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

Never assume or infer the interest type (Buy or Rent) from context alone. Always ask directly: "Are you looking to buy or rent?" This must be explicitly confirmed by the client before calling search_properties. Do not pass interest to the search tool based on inference.

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

PROPERTY PRESENTATION RULES
When presenting search results, never invent narrative. Do not say things like "this is back on the list", "newer options", "recently added", "I noticed", "this just became available", or any phrasing that implies you have knowledge about timing, availability changes, or history that is not in the current search result.

Simply present what the search returned. You do not know when a property was added, whether it was previously shown to this client, or how it compares in recency to others. Only state facts from the property data.

Never say "I noticed" followed by any inventory claim. Never say "newer" or "new listing" unless the property description itself says this.

WHEN PRESENTING PROPERTIES
After calling search_properties, write a short warm message ending with "see the details below" or "take a look below". The property cards follow your message automatically. Keep your message short. Do not list property details in your text.

MULTI-LOCATION SEARCHES
When a client asks for properties in two or more locations, call search_properties separately for each location. Results combine automatically into one numbered list. Write one short message like "I found properties in both Kilimani and Westlands — see the details below."

INTERNAL DATA — NEVER EXPOSE TO CLIENT
Property IDs, UUIDs, database IDs, snapshot data, fingerprints, and any internal reference codes are strictly internal system data. Never show these to clients under any circumstances.

Clients should only ever see: property name, location, number of bedrooms, size in sqm, price, completion date, amenities, and payment plan details.

If you see fields like id, propertyId, uuid, snapshotId, fingerprint, number — use them internally for tool calls only. Never mention or display them in your response to the client.

PROPERTY REFERENCE - NEVER BREAK THESE
Always refer to properties by their number — Property 1, Property 2, Property 3 and so on. Never mention, display, or reference internal IDs, database codes, or UUIDs. When calling get_available_slots or create_booking, use propertyNumber not propertyId. The system handles ID resolution automatically in the backend. You never need to know or use property IDs.

When a client says:
"property 1" → use the ID next to Property 1 in the reference list
"the first one" → use the ID next to Property 1
"both" → use the IDs next to Property 1 and Property 2
"1 and 3" → use the IDs next to Property 1 and Property 3
"all of them" → use all IDs in the reference list

NEVER generate, invent, or guess a property ID. If you cannot find the ID for the property the client selected, call search_properties to retrieve the snapshot — then use the IDs from there. Never use placeholder UUIDs like "property1_id" or "a1b2c3d4-..." or any UUID you create yourself.

BOOKING FLOW
When a client wants to book: confirm which property, call get_available_slots, present times naturally, when they select a time call create_booking immediately, confirm warmly. When a client picks a time like "second option" or "Saturday 12pm" or "the last one" — map to the slot number and call create_booking immediately.

MULTIPLE PROPERTY BOOKINGS
Get slots for all properties first. Present available times together. Book each property with a different time slot. After a slot is used for one property it is no longer available for the next. When a slot conflict occurs, offer the next available slot for that property only. Do not re-book confirmed properties.

BOOKING RETRY
If create_booking fails because a slot is taken, immediately call get_available_slots again and present fresh options. Never tell the client a slot is taken without immediately offering alternatives.

CANCELLATIONS
If a client says they want to cancel, call cancel_booking immediately. Confirm warmly and let them know the agent has been notified.

ESCALATION TIMING — IMPORTANT
Do not escalate to a human agent for informational questions. Answer these fully from your knowledge base first:
- How off-plan works
- Diaspora buying process
- Developer trust concerns
- Payment plans
- Legal process
- Investment returns

Only escalate when:
- Client explicitly asks to speak to someone
- Client asks for a virtual tour or in-person visit
- Client is ready to invest or pay a deposit
- Complex mortgage or legal questions
- Any complaint

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
    description: 'Get available viewing time slots for a property. Use the property NUMBER shown to the client, not any ID.',
    input_schema: {
      type: 'object',
      properties: {
        propertyNumber: {
          type: 'integer',
          description: 'The property number as shown to the client, e.g. 1, 2, 3'
        }
      },
      required: ['propertyNumber']
    }
  },

   {
    name: 'create_booking',
    description: 'Create a viewing booking for a property. Use the property NUMBER and slot NUMBER.',
    input_schema: {
      type: 'object',
      properties: {
        propertyNumber: {
          type: 'integer',
          description: 'The property number as shown to the client, e.g. 1, 2, 3'
        },
        slotNumber: {
          type: 'integer',
          description: 'The slot number the client selected from the available slots list'
        },
        leadName: {
          type: 'string',
          description: 'The client full name'
        }
      },
      required: ['propertyNumber', 'slotNumber', 'leadName']
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

  // =====================================================
  // HARD VALIDATION — backend enforced
  // =====================================================

  if (!context.leadName?.trim()) {
    return {
      error: 'Please collect the client name before searching for properties.',
      missingField: 'name'
    };
  }

  if (!toolInput.interest?.trim()) {
    return {
      error: 'Missing interest. Ask whether client wants to Buy or Rent first.',
      missingField: 'interest'
    };
  }

  if (!toolInput.location?.trim()) {
    return {
      error: 'Missing location. Ask which neighborhood the client prefers.',
      missingField: 'location'
    };
  }

  if (
    toolInput.bedrooms === undefined ||
    toolInput.bedrooms === null
  ) {
    return {
      error: 'Missing bedrooms. Ask how many bedrooms the client needs.',
      missingField: 'bedrooms'
    };
  }

  if (!toolInput.budget && !context.savedBudget) {
    return {
      error: 'Missing budget. Ask for the client budget range before searching.',
      missingField: 'budget'
    };
  }

  // =====================================================
  // NORMALIZATION
  // No fake fallback defaults
  // =====================================================

  const normalizedInterest =
    toolInput.interest.toLowerCase().trim();

  const normalizedLocation =
    toolInput.location.trim();

  const normalizedBedrooms =
    toolInput.bedrooms;

  const normalizedBudget =
    toolInput.budget != null &&
    !isNaN(Number(toolInput.budget))
      ? Number(toolInput.budget)
      : (
          context.savedBudget
            ? Number(context.savedBudget)
            : null
        );

  // =====================================================
  // RESET LOGIC
  // Only reset on MAJOR intent changes
  // =====================================================

  const interestChanged =
    context.savedInterest &&
    normalizedInterest !==
      context.savedInterest.toLowerCase().trim();

  const bedroomChanged =
    context.savedSize !== null &&
    normalizedBedrooms !== context.savedSize;

  const locationChanged =
    context.savedLocation &&
    normalizedLocation.toLowerCase() !==
      context.savedLocation.toLowerCase().trim() &&
    context.newPropertiesThisTurn.length > 0;

  const shouldReset =
    (interestChanged || bedroomChanged || locationChanged) &&
    context.newPropertiesThisTurn.length > 0;

  if (shouldReset) {

    console.log(
      'Major search intent changed — resetting snapshot'
    );

    // Clear DB first
    await tools.updateLead(context.leadId, {
      property_snapshot: JSON.stringify([]),
      found_property_ids: JSON.stringify([]),
      search_fingerprints: JSON.stringify([])
    });

    // Clear memory
    context.newPropertiesThisTurn = [];
    context.foundPropertyIds = [];
    context.searchFingerprintSet = new Set();
    context.newlyAddedProperties = [];
    context.propertyIdMap = {};
  }

  // =====================================================
  // FINGERPRINT
  // =====================================================

  const fingerprint =
    `${normalizedInterest}-${normalizedLocation}-${normalizedBedrooms}-${normalizedBudget}`;

  // =====================================================
  // SNAPSHOT HIT
  // =====================================================

  if (
    context.searchFingerprintSet.has(fingerprint) &&
    context.newPropertiesThisTurn.length > 0
  ) {

    console.log(`Fingerprint hit: ${fingerprint}`);

    console.log(
      `Returning snapshot with ${context.newPropertiesThisTurn.length} properties`
    );

    return {
      properties: context.newPropertiesThisTurn,
      count: context.newPropertiesThisTurn.length,
      fromSnapshot: true
    };
  }

  // =====================================================
  // NEW SEARCH
  // =====================================================

  const result = await tools.searchProperties({
    interest: normalizedInterest,
    location: normalizedLocation,
    bedrooms: normalizedBedrooms,
    budget: normalizedBudget,
    isOffplan: toolInput.isOffplan,
    completionDate: toolInput.completionDate
  });

  if (result.properties && result.properties.length > 0) {

    // =====================================================
    // Store property ID map separately
    // Claude NEVER sees raw IDs
    // =====================================================

    if (result.propertyIdMap) {

      context.propertyIdMap = {
        ...(context.propertyIdMap || {}),
        ...result.propertyIdMap
      };

      console.log(
        'Updated propertyIdMap:',
        JSON.stringify(context.propertyIdMap)
      );
    }

    // Mark fingerprint searched
    context.searchFingerprintSet.add(fingerprint);

    // =====================================================
    // Deduplicate using INTERNAL IDs only
    // =====================================================

    const existingIds = new Set(
      Object.values(context.propertyIdMap || {})
    );

    const existingPropertyNumbers = new Set(
      context.newPropertiesThisTurn.map(
        p => `${p.name}-${p.location}-${p.price}`
      )
    );

    // =====================================================
    // Add clean properties ONLY
    // No UUIDs exposed to Claude
    // =====================================================

    const newOnes = result.properties
          .filter(p => !existingIds.has(p.id))
          .map((p, i) => {
            const num = context.newPropertiesThisTurn.length + i + 1;
            // Store UUID in backend map — never goes to Claude
            context.propertyIdMap[num] = result.propertyIdMap?.[i + 1] || p.id;
            return {
              ...p,
              number: num
              // Note: p.id may or may not be present depending on what searchProperties returns
              // The real UUID is now only in context.propertyIdMap
            };
          });

        if (newOnes.length > 0) {
          context.newPropertiesThisTurn.push(...newOnes);
          context.newlyAddedProperties.push(...newOnes);
          console.log(`Added ${newOnes.length} new. Total: ${context.newPropertiesThisTurn.length}`);
        }

    // =====================================================
    // Auto-select single property
    // =====================================================

    if (context.newPropertiesThisTurn.length === 1) {

      const onlyProperty =
        context.newPropertiesThisTurn[0];

      context.currentPropertyId =
        context.propertyIdMap?.[onlyProperty.number];

      console.log(
        'Single property auto-selected:',
        context.currentPropertyId
      );
    }

    // =====================================================
    // Clean property references
    // No IDs saved into Claude-visible context
    // =====================================================

    // Store number, name, AND the real UUID so it persists across messages
        context.foundPropertyIds = context.newPropertiesThisTurn.map(p => ({
          number: p.number,
          id: context.propertyIdMap[p.number] || null,  // Real UUID from map
          name: p.name
        }));

    // =====================================================
    // Debug snapshot
    // =====================================================

    console.log(
      'SNAPSHOT STATE:',
      JSON.stringify(
        context.newPropertiesThisTurn.map(p => ({
          number: p.number,
          name: p.name,
          location: p.location,
          price: p.price
        }))
      )
    );

    // =====================================================
    // Persist snapshot
    // IMPORTANT:
    // property_snapshot contains NO IDs
    // =====================================================

    const preferencesToSave = {
          conversation_stage: 'properties_shown',
          property_snapshot: JSON.stringify(context.newPropertiesThisTurn),
          found_property_ids: JSON.stringify(context.foundPropertyIds),
          search_fingerprints: JSON.stringify([...context.searchFingerprintSet]),
          property_id_map: JSON.stringify(context.propertyIdMap || {})
        };

    // Save preferences
    if (toolInput.interest) {
      preferencesToSave.interest =
        toolInput.interest;
    }

    if (toolInput.location) {
      preferencesToSave.location =
        toolInput.location;
    }

    if (toolInput.bedrooms !== undefined) {
      preferencesToSave.size =
        `${toolInput.bedrooms} bedroom`;
    }

    if (toolInput.budget) {
      preferencesToSave.budget =
        toolInput.budget.toString();
    }

    await tools.updateLead(
      context.leadId,
      preferencesToSave
    );

    // =====================================================
    // Update saved state
    // =====================================================

    context.savedLocation =
      toolInput.location || context.savedLocation;

    context.savedSize =
      toolInput.bedrooms !== undefined
        ? toolInput.bedrooms
        : context.savedSize;

    context.savedBudget =
      toolInput.budget !== undefined
        ? toolInput.budget
        : context.savedBudget;

    context.savedInterest =
      toolInput.interest || context.savedInterest;
  }

  // =====================================================
  // RETURN STABLE SNAPSHOT
  // =====================================================

  return {
    properties: context.newPropertiesThisTurn,
    count: context.newPropertiesThisTurn.length
  };
}

    case 'get_available_slots': {
      // Resolve property number to real UUID using backend map
      let resolvedPropertyId = null;

      if (toolInput.propertyNumber && context.propertyIdMap) {
        resolvedPropertyId = context.propertyIdMap[toolInput.propertyNumber];
        console.log(`Resolved property ${toolInput.propertyNumber} → ${resolvedPropertyId}`);
      }

      if (!resolvedPropertyId) {
        console.warn('Cannot resolve property number:', toolInput.propertyNumber);
        return {
          success: false,
          error: `Could not identify property number ${toolInput.propertyNumber}. Please confirm the property number from the list.`
        };
      }

      // Validate against known properties
      const validProperty = context.foundPropertyIds?.find(p => p.id === resolvedPropertyId);
      if (!validProperty) {
        console.warn('Property not in current snapshot:', resolvedPropertyId);
        return {
          success: false,
          error: 'That property is not in the current search results. Please select from the list shown.'
        };
      }

      const result = await tools.getAvailableSlots(resolvedPropertyId);

      if (result.slotMap) {
        context.currentSlotMap = JSON.stringify(result.slotMap);
        context.currentPropertyId = resolvedPropertyId;

        await tools.updateLead(context.leadId, {
          available_slots: JSON.stringify(result.slotMap)
        });
      }

      return result;
    }

   case 'create_booking': {

  // =====================================================
  // Resolve property number → real UUID
  // Backend-only mapping
  // =====================================================

  let resolvedPropertyId = null;

  if (
    toolInput.propertyNumber &&
    context.propertyIdMap
  ) {

    resolvedPropertyId =
      context.propertyIdMap[
        toolInput.propertyNumber
      ];

    console.log(
      `Booking: resolved property ${toolInput.propertyNumber} → ${resolvedPropertyId}`
    );
  }

  // =====================================================
  // Fallback to current selected property
  // =====================================================

  if (!resolvedPropertyId) {
    resolvedPropertyId =
      context.currentPropertyId || null;
  }

  // =====================================================
  // Build booking input
  // =====================================================

  const bookingInput = {

    leadId: context.leadId,

    // ALWAYS use resolved UUID internally
    propertyId: resolvedPropertyId,

    slotNumber: toolInput.slotNumber,

    slotMap:
      toolInput.slotMap ||
      context.currentSlotMap,

    // Server still enforces this
    leadName:
      context.leadName ||
      toolInput.leadName ||
      'Client',

    leadPhone: context.leadPhone
  };

  console.log(
    'Booking input:',
    JSON.stringify(bookingInput)
  );

  // =====================================================
  // Validate resolved property
  // =====================================================

  if (!bookingInput.propertyId) {

    console.warn(
      'Cannot resolve property number for booking:',
      toolInput.propertyNumber
    );

    return {
      success: false,

      error:
        toolInput.propertyNumber
          ? `Could not identify property number ${toolInput.propertyNumber}. Please confirm the property number.`
          : 'Missing property selection. Please confirm which property the client wants to book.'
    };
  }

  // =====================================================
  // Validate slot map
  // =====================================================

  if (!bookingInput.slotMap) {

    return {
      success: false,

      error:
        'No slot map available. Please get available slots first.'
    };
  }

  // =====================================================
  // Validate UUID BEFORE booking
  // Extra safety
  // =====================================================

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    !bookingInput.propertyId ||
    !uuidPattern.test(bookingInput.propertyId)
  ) {

    console.error(
      'Invalid property ID rejected:',
      bookingInput.propertyId
    );

    return {
      success: false,

      error:
        'Could not resolve a valid property reference for booking.'
    };
  }

  // =====================================================
  // Create booking
  // =====================================================

  const result =
    await tools.createBooking(bookingInput);

  // =====================================================
  // Post-booking updates
  // =====================================================

  if (result.success) {

    context.completedBookings += 1;

    await tools.updateLead(
      context.leadId,
      {
        conversation_stage:
          'booking_confirmed'
      }
    );

    console.log(
      'Stage updated to booking_confirmed'
    );

    console.log(
      'Completed bookings this turn:',
      context.completedBookings
    );
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

  // Load persisted snapshot from DB
  let persistedSnapshot = [];
  let persistedFingerprints = [];
  let persistedFoundIds = [];
  let persistedIdMap = {};

  try {
    if (lead.property_snapshot) persistedSnapshot = JSON.parse(lead.property_snapshot);
    if (lead.search_fingerprints) persistedFingerprints = JSON.parse(lead.search_fingerprints);
    if (lead.found_property_ids) persistedFoundIds = JSON.parse(lead.found_property_ids);
    if (lead.property_id_map) persistedIdMap = JSON.parse(lead.property_id_map);
  } catch (e) {
    console.error('Failed to parse persisted snapshot:', e.message);
  }

  // ============================================
  // Build stripped snapshot for Claude
  // Removes huge descriptions/photos from context
  // ============================================
  const strippedSnapshot = persistedSnapshot.map(p => ({
    number: p.number,
    name: p.name,
    location: p.location,
    price: p.price,
    bedrooms: p.bedrooms,
    sqm: p.sqm,
    completion: p.completion,
    address: p.address
  }));

  // Rebuild propertyIdMap from persisted found_property_ids
  // This restores the number → UUID mapping across messages
  // Use persisted map first, then rebuild from foundIds as fallback
  const rebuiltIdMap = Object.keys(persistedIdMap).length > 0
    ? persistedIdMap
    : {};

  if (Object.keys(rebuiltIdMap).length === 0 && persistedFoundIds.length > 0) {
    persistedFoundIds.forEach(p => {
      if (p && p.number != null && p.id) {
        rebuiltIdMap[p.number] = p.id;
      }
    });
  }

  const context = {
  leadId: lead.id,
  leadName: lead.name || null,
  leadPhone: cleanPhone,
  currentSlotMap: lead.available_slots || null,
  currentPropertyId: lead.selected_property_id || null,

  // Full data preserved for webhook/property cards
  newPropertiesThisTurn: [...persistedSnapshot],

  // Stripped version only for Claude prompt context
  promptPropertySnapshot: strippedSnapshot,

  foundPropertyIds: [...persistedFoundIds],
  searchFingerprintSet: new Set(persistedFingerprints),
  newlyAddedProperties: [],
  savedLocation: lead.location || null,
  savedSize: typeof lead.size === 'string'
    ? parseInt(lead.size, 10) || null
    : lead.size,
  savedBudget: lead.budget ? Number(lead.budget) : null,
  savedInterest: lead.interest || null,
  completedBookings: 0,
  propertyCounter: persistedFoundIds.length,
  propertyIdMap: rebuiltIdMap,
  toolCallsThisTurn: 0
};

  console.log('Processing message for lead:', lead.id, '| Phone:', cleanPhone);

  // Load inventory from database
  let availableOptionsContext = '';

  try {

    // ============================================
    // FIX 3: Skip huge inventory injection
    // once properties already shown
    // ============================================
    if (isActiveSession && persistedSnapshot.length > 0) {

      availableOptionsContext =
        '\n\nProperties have already been shown to this client. Use the PROPERTY REFERENCE below for any booking requests.';

    } else {

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
      propertyContext =
        `\n\nCURRENT SELECTED PROPERTY:\nProperty ID: ${lead.selected_property_id}\nUse this ID directly for get_available_slots and create_booking. Do not call search_properties again.`;
    }
  }

  // ALWAYS inject snapshot IDs when they exist
  // This prevents Claude from hallucinating property IDs

  // Inject clean property reference — numbers only, no UUIDs
  if (persistedFoundIds && persistedFoundIds.length > 0) {

    const refList = persistedFoundIds.map(p =>
      `Property ${p.number}: ${p.name}`
    ).join('\n');

    propertyContext += `\n\nPROPERTY REFERENCE:\n${refList}`;
  }

  const systemContext =
    SYSTEM_PROMPT +
    availableOptionsContext +
    KNOWLEDGE_BASE +
    clientProfile +
    propertyContext;

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

      return {
        text: 'Sorry, I am having trouble right now. Please try again.',
        properties: null
      };
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

      messages.push({
        role: 'assistant',
        content: response.content
      });

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

      messages.push({
        role: 'user',
        content: toolResults
      });

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

  console.log(
    'New properties this turn:',
    context.newlyAddedProperties.length > 0
      ? `YES — ${context.newlyAddedProperties.length} properties`
      : 'NO new properties'
  );

  console.log('Snapshot size:', context.newPropertiesThisTurn.length);

  if (
    finalText?.toLowerCase().includes('i found') &&
    context.newPropertiesThisTurn.length === 0
  ) {
    console.warn('POSSIBLE HALLUCINATION: Claude claimed to find properties without calling search tool');
  }

  if (
    finalText?.toLowerCase().includes('we have') &&
    context.newPropertiesThisTurn.length === 0
  ) {
    console.warn('POSSIBLE HALLUCINATION: Claude claimed availability without calling search tool');
  }

  // If Claude ended turn with no text after a tool call, provide a contextual fallback
  if (!finalText || finalText.trim().length === 0) {

    const leadName = context.leadName || '';

    if (leadName) {

      finalText =
        `Nice to meet you ${leadName}! What are you looking for today? ` +
        `Are you interested in buying or renting, and do you have a location or budget in mind?`;

    } else {

      finalText = 'Thanks for that. How can I help you today?';
    }

    console.log('Empty AI response detected — using contextual fallback');
  }

  return {
    text: finalText,

    // Only send cards for newly added properties this turn
    properties: context.newlyAddedProperties.length > 0
      ? context.newlyAddedProperties
      : null
  };
}

module.exports = { processMessage };