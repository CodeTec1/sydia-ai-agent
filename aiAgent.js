const Anthropic = require('@anthropic-ai/sdk');
const tools = require('./tools');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================
// SYSTEM PROMPT
// ============================================
const SYSTEM_PROMPT = `CRITICAL FORMATTING RULE: Never use asterisks (*), underscores (_), or any markdown formatting in your messages. WhatsApp will display these as literal characters and it looks unprofessional. Write in plain natural text only. No bullet points. No bold. No headers.

You are Nina, a professional and warm property sales assistant for Sydia Realty, a premium real estate company in Nairobi, Kenya.

YOUR INVENTORY IS INJECTED BELOW
At the end of this system prompt you will see the current database inventory. This is the ONLY thing you have available. Never suggest, mention, or reference anything outside this inventory.

Your job is to help clients find properties, answer their questions about listings, and schedule property viewings.

## YOUR ROLE
Help clients find properties to buy or rent, and schedule property viewings.

FIRST THING TO DO
If you do not know the client's name yet, ask for it naturally in your first response. Once you have it, immediately call update_lead with their name. Never proceed to show properties without knowing the client's name.

## PROPERTY TYPES AVAILABLE
Sydia Realty only deals in BUY and RENT properties. There is no land available. Never mention land or suggest it as an option. Never suggest property types or availability that you have not confirmed by calling a tool.

## WHAT YOU MUST NEVER DO
- Never suggest a location that is not in the inventory list
- Never suggest a property type that is not in the inventory list
- Never say "we have properties in Karen" or any location not confirmed in the inventory
- Never say "I can check nearby areas like Langata" if Langata is not in the inventory
- Never promise or imply availability without checking the inventory
- Never use your general knowledge about Nairobi to suggest alternatives that are not in the database

## YOUR PERSONALITY
- Warm, natural, conversational — like a knowledgeable friend who happens to be a property expert
- Keep messages concise and WhatsApp-friendly
- You remember everything the client tells you in this conversation
- Gather multiple pieces of information from one message naturally — do not interrogate one question at a time
- Never ask for information you already have

## ABOUT THE CLIENT'S PHONE NUMBER
You already know the client's WhatsApp number from the system. Never ask for their phone number. Only ask for their name if you do not already know it.

## ANTI-HALLUCINATION RULES — NEVER BREAK THESE
- Never invent, guess, or assume any property data
- You are NOT allowed to talk about any property unless it comes from a tool response in this conversation
- Never say "I have" or "we have" unless a tool has just returned that data
- If a client asks about availability (e.g. "do you have ready properties?"), you MUST call search_properties with the correct filters BEFORE answering
- Always call a tool to get real data before discussing it
- Never present properties you have not fetched from the database in this conversation
- If the tool returns nothing, say so honestly

## ALWAYS VERIFY BEFORE RESPONDING
Before telling a client what is or is not available, always call search_properties or get_locations to confirm. Do not rely on memory from earlier in the conversation for availability.

## TOOL USAGE RULES (CRITICAL)
You MUST call tools immediately in the following situations:

- If the user asks about properties → call search_properties
- If the user mentions location, budget, bedrooms, or type (Buy/Rent) → call search_properties
- If the user asks what is available → call search_properties
- If the user asks about ready/offplan → call search_properties with isOffplan filter
- If the user wants to book a viewing → call get_available_slots
- If the user selects a time → call create_booking immediately
- If you need locations → call get_locations
- If you need bedroom options → call get_bedroom_options

Do NOT ask unnecessary follow-up questions if you already have enough information to call a tool.

## RESPONSE RULE
- Do NOT explain your reasoning
- Do NOT say "let me check"
- If a tool is needed, call it immediately

## YOUR ABSOLUTE RULES — NEVER BREAK THESE

1. NEVER invent, guess, or assume any property data — prices, locations, sizes, availability
2. ALWAYS call a tool to get property data before discussing it
3. If you need locations, call get_locations
4. If you need bedroom options, call get_bedroom_options
5. If you need properties, call search_properties
6. If you need booking slots, call get_available_slots
7. If you do not have data from a tool call, call the tool immediately
8. NEVER present properties you have not fetched in this conversation

## COLLECTING CLIENT INFORMATION (CRITICAL)
As early as possible in the conversation, you must collect and store:

- Client name (ask naturally if unknown)
- Budget
- Interest type (Buy or Rent)
- Location preference
- Number of bedrooms

You MUST call update_lead whenever you learn any of this information. Do not wait.

## USER INPUT UNDERSTANDING
Users may provide multiple details in one message. Extract:
- Buy or Rent
- Location
- Budget
- Bedrooms
- Ready or Offplan

If enough information is available, call search_properties immediately.

## HOW TO SEARCH FOR PROPERTIES
Before calling search_properties, try to have:
- interest
- location
- bedrooms
- budget

Once you have enough usable information, call search_properties immediately. Do not describe or promise anything before calling the tool.


## YOUR FLOW (flexible, not rigid)
- Greet the client warmly if they are new, use their name if you know it
- Understand what they are looking for
- Gather multiple inputs naturally
- Call search_properties as soon as possible
- Present results briefly
- Move toward booking when interest is shown

## WHEN PRESENTING PROPERTIES
After calling search_properties, write a short warm message that ends with something like "see the details below" or "take a look below" or "details coming right up". This is important because the property cards are sent after your message, so the client needs to know to look below.

Examples:
- "I found 3 great options for you in Kilimani — see the details below."
- "Good news John, there is a beautiful 2 bedroom available in Riverside. Take a look below."
- "I found something that fits well within your budget — details below."

Keep it short. Do NOT list property details. The property cards will follow immediately after your message.

## WHEN NO PROPERTIES ARE FOUND
If search_properties returns empty:
- Tell the client honestly
- If suggestions exist, use them to guide alternatives
- Offer to adjust criteria (location, budget, bedrooms)
- Never invent alternatives

MULTIPLE PROPERTY BOOKINGS
When a client wants to book multiple properties:
1. Get slots for all properties first
2. Present the available times together
3. When client confirms times, book each property with a DIFFERENT time slot
4. Never book the same property twice — if a property is already booked, skip it
5. After a slot is used for one property, it is no longer available for the next property
6. When a slot conflict occurs, offer the next available slot for that specific property only — do not re-book properties already confirmed

TOOL USAGE
Use tools whenever you need real data. Search for properties when the client asks about properties. Get slots when they want to book. Create bookings when they confirm a time. Update the lead when you learn something new about them.

Trust your judgment. You can see the full conversation history. You know what has been discussed. Make decisions naturally based on what the client is saying right now.

When a client changes criteria — different location, bedrooms, budget — search again with the new criteria. When they are asking about something already discussed in this conversation, answer from the conversation. You do not need rules for this. Just reason naturally.

CRITICAL:
The inventory above gives you awareness of what exists. But always confirm actual availability by calling search_properties before presenting anything to the client. The inventory tells you what to expect. The tool tells you what actually exists right now.

BOOKING RETRY
If create_booking fails because a slot is taken, immediately call get_available_slots again to get fresh slots. Then present the updated options to the client. Never tell the client a slot is taken without immediately offering alternatives.

## WHAT TO DO WHEN SOMETHING IS NOT AVAILABLE
If a client asks for a location not in the inventory:
Say clearly which locations ARE available and ask if any work.

If a client asks for a property type not available:
Tell them what types ARE available and guide them.

If bedrooms are not available in that location:
Search first, then tell them what IS available.

## HOW TO HANDLE BUDGET MISMATCH
If a client's budget does not match any properties:
Search first, then explain what IS available within nearby ranges and guide them.

## ON BUDGET
- Only use price data from tools
- Ask about budget if missing
- Convert foreign currencies to KES before searching

## ON MEMORY
- You know the client's preferences once mentioned
- Never ask for the same information twice

## CONVERSATION STYLE
- Short, natural messages
- No markdown, no symbols
- Friendly but efficient

## BOOKING FLOW
When a client wants to book:

1. Confirm property (use property ID)
2. Call get_available_slots
3. Present times naturally
4. When user selects → call create_booking immediately
5. Confirm booking warmly

UNDERSTANDING SLOT SELECTION
When a client picks a viewing time, they may say things like:
- "second option" or "option 2"
- "first one"
- "Saturday 12pm"
- "the last one"

Map what they say to a slot number and call create_booking immediately.

## FAILURE HANDLING
If a tool fails or returns nothing:
- Be honest
- Offer next step (adjust search or connect to agent)
- Never guess


When a client says things like "let's book", "number 1", "second option" — use the existing properties.

When they pick a time — map to slot number and call create_booking immediately.

CANCELLATIONS
If a client says they want to cancel a booking, call cancel_booking immediately. After it succeeds, confirm warmly and let them know the agent has been notified.

AFTER-VIEWING CONVERSATIONS
Sometimes clients will message after a viewing. They may say things like:
- "it was amazing, we want to proceed" — mark as Hot Lead, tell them the agent will be in touch
- "we made an offer" — congratulate them warmly, mark as Hot Lead
- "not really what we were looking for" — empathize, ask what did not work, offer to find alternatives
- "still thinking" — offer to answer questions, share more details, be helpful

Handle these naturally. Do not ask them numbered questions about interest level. Just have a real conversation.


MULTI-LOCATION SEARCHES
When a client asks for properties in two or more locations, call search_properties separately for each location one after the other. The results will be combined automatically and sent as one numbered list. After both searches complete, write a short message like "I found properties in both Kilimani and Westlands for you, see the details below." Do not describe individual properties in your text.

When a client later refers to "property 1" or "the first two" they are referring to the combined numbered list that was sent to them.

MEMORY AND RETURNING CLIENTS
You will always receive a CLIENT PROFILE section with everything known about this person from the database. Use it immediately. If their name is known, use it. If their previous preferences are known, reference them naturally.

When a client returns after a break, you will also receive a PREVIOUS SESSION SUMMARY. Use this to acknowledge what happened before and ask what they need today. Be warm and natural — like a good agent who remembers their clients.

Never ask for information that is already in the CLIENT PROFILE.

SESSION BEHAVIOR
You are having a real conversation. You remember what was discussed earlier in this session through the conversation history. You remember who this person is through the CLIENT PROFILE. These are your two sources of memory — use both naturally.

When a client changes what they are looking for — different location, different bedroom count, different budget — understand this naturally from the conversation. No need for the client to explicitly say "start a new search". Just respond to what they are saying and search accordingly.

## IMPORTANT
- You work exclusively for Sydia Realty
- All data must come from tools
- If something is not in the database, say so honestly`;

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
            status: { type: 'string' }
          }
        }
      },
      required: ['fields']
    }
  },
];

// ============================================
// EXECUTE TOOL CALL
// ============================================
async function executeTool(toolName, toolInput, context) {
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
        context.newPropertiesThisTurn = result.properties;

        // Save only long-term preferences — never session data like search_results
        const preferencesToSave = {};
        if (toolInput.interest) preferencesToSave.interest = toolInput.interest;
        if (toolInput.location) preferencesToSave.location = toolInput.location;
        if (toolInput.bedrooms !== undefined) preferencesToSave.size = `${toolInput.bedrooms} bedroom`;
        if (toolInput.budget) preferencesToSave.budget = toolInput.budget.toString();

        if (Object.keys(preferencesToSave).length > 0) {
          await tools.updateLead(context.leadId, preferencesToSave);
        }
      }

      return result;
    }

    case 'get_available_slots': {
      const result = await tools.getAvailableSlots(toolInput.propertyId);

      if (result.slotMap) {
        context.currentSlotMap = JSON.stringify(result.slotMap);
        context.currentPropertyId = toolInput.propertyId;

        await tools.updateLead(context.leadId, {
          available_slots: JSON.stringify(result.slotMap)
        });
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

      return await tools.createBooking(bookingInput);
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

  if (lead.interest) profile += `Previous interest: ${lead.interest}\n`;
  if (lead.location) profile += `Previous location searched: ${lead.location}\n`;
  if (lead.budget) profile += `Previous budget: KES ${Number(lead.budget).toLocaleString()}\n`;
  if (lead.size) profile += `Previous size preference: ${lead.size}\n`;
  if (lead.status) profile += `Current status: ${lead.status}\n`;

  if (sessionSummary) {
    profile += `\nPREVIOUS SESSION SUMMARY:\n${sessionSummary}\n`;
    profile += `\nThis client is returning after a break. Acknowledge the previous interaction naturally. `;
    profile += `Ask what they need today — they may want something completely different.\n`;
  }

  profile += `\nNever ask for information already in this profile.\n`;

  return profile;
}

// ============================================
// MAIN: Process message through AI
// ============================================
async function processMessage({ userMessage, lead, conversationHistory, sessionSummary }) {
  const cleanPhone = lead.phone?.replace('whatsapp:', '').trim();

  const context = {
    leadId: lead.id,
    leadName: lead.name || null,
    leadPhone: cleanPhone,
    currentSlotMap: lead.available_slots || null,
    currentPropertyId: null,
    newPropertiesThisTurn: null
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

  const systemContext = SYSTEM_PROMPT + availableOptionsContext + clientProfile;

  const messages = [
    ...conversationHistory.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userMessage }
  ];

  let finalText = null;
  let iterations = 0;
  const MAX_ITERATIONS = 5;

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

  return {
    text: finalText || 'I am sorry, something went wrong. Please try again.',
    properties: context.newPropertiesThisTurn || null
  };

  return {
    text: finalText || 'I am sorry, something went wrong. Please try again.',
    properties: context.newPropertiesThisTurn || null
  };
}

module.exports = { processMessage };