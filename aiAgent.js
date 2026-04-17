const Anthropic = require('@anthropic-ai/sdk');
const tools = require('./tools');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================
// SYSTEM PROMPT
// ============================================
const SYSTEM_PROMPT = `CRITICAL FORMATTING RULE: Never use asterisks (*), underscores (_), or any markdown formatting in your messages. WhatsApp will display these as literal characters and it looks unprofessional. Write in plain natural text only. No bullet points. No bold. No headers.

You are Nina, a professional and warm property sales assistant for Sydia Realty, a premium real estate company in Nairobi, Kenya.

Your job is to help clients find properties, answer their questions about listings, and schedule property viewings.

## YOUR ROLE
Help clients find properties to buy or rent, and schedule property viewings.

FIRST THING TO DO
If you do not know the client's name yet, ask for it naturally in your first response. Once you have it, immediately call update_lead with their name. Never proceed to show properties without knowing the client's name.

## PROPERTY TYPES AVAILABLE
Sydia Realty only deals in BUY and RENT properties. There is no land available. Never mention land or suggest it as an option. Never suggest property types or availability that you have not confirmed by calling a tool.

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

## HOW TO PRESENT PROPERTIES
After calling search_properties, respond with a SHORT natural message like:
"I found some great options for you in Kilimani, take a look!"

Do NOT list property details. The system will send property cards automatically.

## WHEN NO PROPERTIES ARE FOUND
If search_properties returns empty:
- Tell the client honestly
- If suggestions exist, use them to guide alternatives
- Offer to adjust criteria (location, budget, bedrooms)
- Never invent alternatives

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

## FAILURE HANDLING
If a tool fails or returns nothing:
- Be honest
- Offer next step (adjust search or connect to agent)
- Never guess


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
        if (!context.propertiesAlreadySent) {
          context.lastProperties = result.properties;
        }
        context.lastProperties = result.properties;

        const updateFields = {
          search_results: result.properties.map((p, i) => ({
            number: i + 1,
            id: p.id,
            name: p.name,
            price: p.rawPrice,
            location: p.location,
            address: p.address
          }))
        };

        if (toolInput.interest) updateFields.interest = toolInput.interest;
        if (toolInput.location) updateFields.location = toolInput.location;
        if (toolInput.bedrooms !== undefined) updateFields.size = `${toolInput.bedrooms} bedroom`;
        if (toolInput.budget) updateFields.budget = toolInput.budget.toString();
        if (toolInput.isOffplan !== undefined) updateFields.is_offplan = toolInput.isOffplan;
        if (toolInput.completionDate) updateFields.completion_range = toolInput.completionDate;

        await tools.updateLead(context.leadId, updateFields);
      }

      return result;
    }

    case 'get_available_slots': {
      const result = await tools.getAvailableSlots(toolInput.propertyId);

      if (result.slotMap && context.leadId) {
        context.currentSlotMap = JSON.stringify(result.slotMap);

        // Only save available_slots, NOT selected_property_id
        // selected_property_id must be a real property UUID from search results
        await tools.updateLead(context.leadId, {
          available_slots: JSON.stringify(result.slotMap)
        });

        // Save property ID to context only — not to DB yet
        context.currentPropertyId = toolInput.propertyId;
      }

      return result;
    }

    case 'create_booking': {
      const bookingInput = {
        leadId: context.leadId,
        propertyId: toolInput.propertyId || context.currentPropertyId,
        slotNumber: toolInput.slotNumber,
        slotMap: toolInput.slotMap || context.currentSlotMap,
        leadName: toolInput.leadName || context.leadName || 'Client',
        leadPhone: context.leadPhone
      };

      console.log('Booking input:', JSON.stringify(bookingInput));

      if (!bookingInput.propertyId) {
        return { success: false, error: 'No property ID. Please select a property first.' };
      }

      if (!bookingInput.slotMap) {
        return { success: false, error: 'No slot map. Please get available slots first.' };
      }

      const result = await tools.createBooking(bookingInput);
      console.log('createBooking result:', JSON.stringify(result));

      if (result.success) {
        context.lastBooking = result;
      }

      return result;
    }

    case 'update_lead': {
      const id = toolInput.leadId || context.leadId;
      if (!id) return { success: false, error: 'No lead ID' };

      if (toolInput.fields?.name || toolInput.fields?.Name) {
        context.leadName = toolInput.fields.name || toolInput.fields.Name;
      }

      return await tools.updateLead(id, toolInput.fields);
    }

    default:
      console.error(`Unknown tool called: ${toolName}`);
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
    lastBooking: null,
    propertiesAlreadySent: false
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
        model: 'claude-sonnet-4-6',
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