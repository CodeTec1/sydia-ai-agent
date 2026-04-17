const Anthropic = require('@anthropic-ai/sdk');
const tools = require('./tools');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================
// SYSTEM PROMPT
// ============================================
const SYSTEM_PROMPT = `CRITICAL FORMATTING RULE: Never use asterisks (*), underscores (_), or any markdown formatting in your messages. WhatsApp will display these as literal characters and it looks unprofessional. Write in plain natural text only.


You are Nina, a professional and warm property sales assistant for Sydia Realty, a premium real estate company in Nairobi, Kenya.

Your job is to help clients find properties, answer their questions about listings, and schedule property viewings.

## YOUR ROLE
Help clients find properties to buy or rent, and schedule property viewings.

## PROPERTY TYPES AVAILABLE
Sydia Realty only deals in BUY and RENT properties. There is no land available. Never mention land or suggest it as an option.

## YOUR PERSONALITY
- Warm, natural, conversational — like a knowledgeable friend who happens to be a property expert
- Never use asterisks or bold formatting in your messages. Write in plain text only.
- Keep messages concise and WhatsApp-friendly. No long lists, no heavy formatting.
- You remember everything the client tells you in this conversation
- Gather multiple pieces of information from one message naturally — do not interrogate one question at a time
- Never ask for information you already have

## ABOUT THE CLIENT'S PHONE NUMBER
You already know the client's WhatsApp number from the system. Never ask for their phone number. Only ask for their name if you do not already know it.

## ANTI-HALLUCINATION RULES — NEVER BREAK THESE
- Never invent, guess, or assume any property data
- You are NOT allowed to talk about any property unless it comes from a tool response in this conversation
- Always call a tool to get real data before discussing it
- Never present properties you have not fetched from the database in this conversation
- If you do not have data, call the tool. If the tool returns nothing, say so honestly.

## TOOL USAGE RULES (CRITICAL)
You MUST call tools immediately in the following situations:

- If the user asks about properties → call search_properties
- If the user mentions a location, budget, bedrooms, or type (Buy/Rent) → call search_properties
- If the user asks what is available → call search_properties
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

## WHEN NO PROPERTIES ARE FOUND
If search_properties returns an empty list but includes a suggestion object, use that data to tell the client what IS available. For example "I don't have a 4 bedroom in that range, but I do have 2 and 3 bedroom options from KES 10M to 18M — would any of those work for you?"

## USER INPUT UNDERSTANDING
Users may provide multiple details in one message. Extract:
- Buy or Rent
- Location
- Budget
- Bedrooms
- Ready or Offplan

If enough information is available, call search_properties immediately.

## YOUR FLOW (flexible, not rigid)
- Greet the client warmly if they are new, use their name if you know it
- Understand what they are looking for — type (Buy/Rent), area, size, budget, ready or offplan
- You can gather multiple pieces of information from one message — do not ask one question at a time like a robot
- Once you have enough to search, call search_properties
- Present properties clearly and attractively
- When a client wants to book, get available slots and guide them through booking
- After booking, confirm all details clearly

## HOW TO PRESENT PROPERTIES
When you find properties using the search_properties tool, respond with a SHORT natural message like:
"I found 2 great options for you in Kilimani. Take a look at these!"
OR
"Good news — I found some properties that match what you are looking for."

Do NOT list property details, prices, sizes, or descriptions in your text. The detailed property cards with photos will be sent automatically by the system. Just announce what you found briefly and warmly.

## ON BUDGET
- Only show price ranges if they come from the database via a tool
- After showing properties, gently ask if the budget works for them
- If a user mentions a budget in USD or GBP or EUR, convert to KES using the current approximate rate before searching.

## ON MEMORY
- You know the client's name, budget, preferences if they have been mentioned
- Never ask for information the client has already given you

## CONVERSATION STYLE
- Short paragraphs, natural language, no bullet points unless absolutely necessary
- Never use asterisks or markdown formatting — WhatsApp bold with asterisks looks robotic
- Be warm but efficient — respect the client's time
- When you do not know something, say so honestly and offer to connect them with the agent

## WHEN PRESENTING PROPERTIES
When you find properties, briefly summarize what you found in text. 
The system will automatically send the detailed property cards with photos separately.
So you do not need to list every detail — just say something like 
"Great news! I found 3 properties matching your criteria in Westlands. 
Here they are 👇" and the detailed cards will follow automatically.

## BOOKING FLOW
When a client wants to book a viewing:
1. Call get_available_slots with the property ID
2. Present the slots naturally — do not number them like a menu, just say "I have Saturday 18 April at 9am or 12pm available — which works for you?"
3. When they pick a slot, call create_booking immediately with all the details
4. Confirm the booking warmly after it is created
5. Never ask for the client's phone number — you already have it

## FAILURE HANDLING
If a tool returns no results:
- Tell the user clearly that no matching properties were found
- Offer to connect them with a human agent
- Do NOT guess or suggest properties without data

## IMPORTANT
- You work exclusively for Sydia Realty
- All property data comes from Sydia Realty's database only
- If a client asks about properties not in the database, tell them honestly you do not have that listing
- If no properties match, offer to connect them with the agent directly`;

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
          description: 'Property type: Buy, Rent, or Land'
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
        interest: { type: 'string', description: 'Property type: Buy, Rent, or Land' },
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
        interest: { type: 'string', description: 'Buy, Rent, or Land' },
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
    description: 'Get available viewing time slots for a property. Call this when a client wants to book a viewing. The leadPhone is already known from context — do not ask the client for it.',
    input_schema: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'The property UUID from the search results'
        }
      },
      required: ['propertyId']
    }
  },
  {
    name: 'create_booking',
    description: 'Create a confirmed viewing booking. Call this after the client confirms their preferred time slot. The client phone number is already known — never ask for it.',
    input_schema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'Lead ID from context' },
        propertyId: { type: 'string', description: 'Property UUID' },
        slotNumber: { type: 'number', description: 'The slot number the client chose' },
        slotMap: { type: 'string', description: 'JSON slot map from get_available_slots' },
        leadName: { type: 'string', description: 'Client name' },
        leadPhone: { type: 'string', description: 'Client phone — already known from context, do not ask client' }
      },
      required: ['propertyId', 'slotNumber']
    }
  },

  {
    name: 'update_lead',
    description: 'Update lead information in the CRM. Call this when you learn the client name, budget, interest, or other key info.',
    input_schema: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        fields: {
          type: 'object',
          description: 'Fields to update: name, budget, interest, location, size, status, etc.'
        }
      },
      required: ['leadId', 'fields']
    }
  }
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
        context.lastProperties = result.properties;
        // Save search results to lead immediately
        if (context.leadId) {
          const searchResultsToSave = result.properties.map((p, i) => ({
            number: i + 1,
            id: p.id,
            name: p.name,
            price: p.rawPrice,
            location: p.location,
            address: p.address
          }));
          await tools.updateLead(context.leadId, {
            search_results: searchResultsToSave,
            interest: toolInput.interest || null,
            location: toolInput.location || null
          });
        }
      }
      return result;
    }

    case 'get_available_slots': {
      const result = await tools.getAvailableSlots(toolInput.propertyId);
      if (result.slotMap && context.leadId) {
        context.currentSlotMap = JSON.stringify(result.slotMap);
        await tools.updateLead(context.leadId, {
          available_slots: JSON.stringify(result.slotMap),
          selected_property_id: toolInput.propertyId
        });
      }
      return result;
    }

    case 'create_booking': {
      const bookingInput = {
        leadId: toolInput.leadId || context.leadId,
        propertyId: toolInput.propertyId,
        slotNumber: toolInput.slotNumber,
        slotMap: toolInput.slotMap || context.currentSlotMap,
        leadName: toolInput.leadName || context.leadName || 'Client',
        leadPhone: context.leadPhone  // Always use from context, never from Claude
      };

      console.log('Creating booking with:', JSON.stringify(bookingInput));

      if (!bookingInput.slotMap) {
        return { success: false, error: 'No slot map available. Please get available slots first.' };
      }

      const result = await tools.createBooking(bookingInput);
      if (result.success) {
        context.lastBooking = result;
        // Update lead status
        if (context.leadId) {
          await tools.updateLead(context.leadId, {
            status: 'Booked',
            conversation_stage: 'booking_confirmed'
          });
        }
      }
      return result;
    }

    case 'update_lead': {
      if (!toolInput.leadId && !context.leadId) {
        return { success: false, error: 'No lead ID available' };
      }
      const id = toolInput.leadId || context.leadId;

      // Update context name if being set
      if (toolInput.fields?.name) {
        context.leadName = toolInput.fields.name;
      }

      return await tools.updateLead(id, toolInput.fields);
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ============================================
// MAIN: Process message through AI
// ============================================
async function processMessage({ userMessage, lead, conversationHistory }) {
  const cleanPhone = lead.phone
    ? lead.phone.replace('whatsapp:', '').trim()
    : null;

  const context = {
    leadId: lead.id,
    leadName: lead.name || null,
    leadPhone: cleanPhone,
    currentSlotMap: lead.available_slots || null,
    lastProperties: null,
    lastBooking: null
  };

  console.log('Processing message for lead:', lead.id, '| Phone:', cleanPhone);

  const messages = [
    ...conversationHistory.map(h => ({
      role: h.role,
      content: h.content
    })),
    {
      role: 'user',
      content: userMessage
    }
  ];

  let finalText = null;
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`--- AI iteration ${iterations} ---`);

    let response;
    try {
      response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages: messages
      });
    } catch (err) {
      console.error('Claude API error:', err.message);
      return {
        text: 'Sorry, I am having trouble right now. Please try again in a moment.',
        properties: null
      };
    }

    console.log('Stop reason:', response.stop_reason);
    console.log('Content blocks:', response.content.map(b => b.type).join(', '));

    if (response.stop_reason === 'end_turn') {
      for (const block of response.content) {
        if (block.type === 'text') {
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

        console.log(`Executing tool: ${block.name}`);
        console.log('Tool input:', JSON.stringify(block.input));

        let result;
        try {
          result = await executeTool(block.name, block.input, context);
          console.log(`Tool result for ${block.name}:`, JSON.stringify(result).substring(0, 200));
        } catch (err) {
          console.error(`Tool execution error for ${block.name}:`, err.message);
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

      continue;
    }

    // Unexpected stop reason
    console.log('Unexpected stop reason:', response.stop_reason);
    break;
  }

  if (!finalText) {
    finalText = 'I am sorry, something went wrong. Please try again.';
  }

  return {
    text: finalText,
    properties: context.lastProperties || null
  };
}

module.exports = { processMessage };