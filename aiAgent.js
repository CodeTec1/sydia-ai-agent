const Anthropic = require('@anthropic-ai/sdk');
const tools = require('./tools');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================
// SYSTEM PROMPT
// ============================================
const SYSTEM_PROMPT = `You are Nina, a professional and warm property sales assistant for Sydia Realty, a premium real estate company in Nairobi, Kenya.

Your job is to help clients find properties, answer their questions about listings, and schedule property viewings.

## YOUR PERSONALITY
- Warm, professional, and conversational — like a knowledgeable human agent
- You remember everything the client tells you in this conversation
- You ask natural follow-up questions, not rigid one-by-one interrogations
- You are patient and helpful, never pushy

## YOUR ABSOLUTE RULES — NEVER BREAK THESE

1. NEVER invent, guess, or assume any property data — prices, locations, sizes, availability
2. ALWAYS call a tool to get property data before discussing it
3. If you need locations, call get_locations
4. If you need bedroom options, call get_bedroom_options
5. If you need properties, call search_properties
6. If you need booking slots, call get_available_slots
7. If you do not have data from a tool call, tell the client you are checking and call the tool
8. NEVER present properties you have not fetched in this conversation

## YOUR FLOW (flexible, not rigid)
- Greet the client warmly if they are new, use their name if you know it
- Understand what they are looking for — type (Buy/Rent), area, size, budget, ready or offplan
- You can gather multiple pieces of information from one message — do not ask one question at a time like a robot
- Once you have enough to search, call search_properties
- Present properties clearly and attractively
- When a client wants to book, get available slots and guide them through booking
- After booking, confirm all details clearly

## ON BUDGET
- Always show price ranges from the database before asking for budget
- After showing properties, gently ask if the budget works for them

## ON MEMORY
- You know the client's name, budget, preferences if they have been mentioned
- Never ask for information the client has already given you

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
    description: 'Get available viewing slots for a property. Call this when a client wants to book a viewing.',
    input_schema: {
      type: 'object',
      properties: {
        propertyId: { type: 'string', description: 'The property UUID' }
      },
      required: ['propertyId']
    }
  },
  {
    name: 'create_booking',
    description: 'Create a viewing booking. Only call this after confirming the slot with the client.',
    input_schema: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        propertyId: { type: 'string' },
        slotNumber: { type: 'number' },
        slotMap: { type: 'string', description: 'JSON string of slot map from get_available_slots' },
        leadName: { type: 'string' },
        leadPhone: { type: 'string' }
      },
      required: ['leadId', 'propertyId', 'slotNumber', 'slotMap', 'leadName', 'leadPhone']
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
  console.log(`Tool called: ${toolName}`, JSON.stringify(toolInput));

  try {
    switch (toolName) {
      case 'get_locations':
        return await tools.getLocations(toolInput.interest);

      case 'get_bedroom_options':
        return await tools.getBedroomOptions(toolInput.interest, toolInput.location);

      case 'get_completion_dates':
        return await tools.getCompletionDates(
          toolInput.interest,
          toolInput.location,
          toolInput.bedrooms,
          toolInput.budget
        );

      case 'search_properties':
        return await tools.searchProperties(toolInput);

      case 'get_available_slots':
        const slotsResult = await tools.getAvailableSlots(toolInput.propertyId);
        // Save slot map to lead for use in booking
        if (context.leadId && slotsResult.slotMap) {
          await tools.updateLead(context.leadId, {
            available_slots: JSON.stringify(slotsResult.slotMap)
          });
          context.currentSlotMap = JSON.stringify(slotsResult.slotMap);
        }
        return slotsResult;

      case 'create_booking':
        const bookingInput = {
          ...toolInput,
          slotMap: toolInput.slotMap || context.currentSlotMap
        };
        return await tools.createBooking(bookingInput);

      case 'update_lead':
        return await tools.updateLead(toolInput.leadId, toolInput.fields);

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`Tool error in ${toolName}:`, err.message);
    return { error: err.message };
  }
}

// ============================================
// MAIN: Process message through AI
// ============================================
async function processMessage({ userMessage, lead, conversationHistory }) {
  const context = {
    leadId: lead.id,
    leadName: lead.name,
    leadPhone: lead.phone,
    currentSlotMap: lead.available_slots || null
  };

  // Build messages array from history
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

  let response = null;
  let finalText = null;

  // Agentic loop — keep going until Claude gives a final text response
  while (true) {
    response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages: messages
    });

    console.log('Claude stop reason:', response.stop_reason);

    // If Claude wants to use a tool
    if (response.stop_reason === 'tool_use') {
      // Add Claude's response to messages
      messages.push({
        role: 'assistant',
        content: response.content
      });

      // Execute all tool calls
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input, context);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result)
          });
        }
      }

      // Add tool results to messages and loop
      messages.push({
        role: 'user',
        content: toolResults
      });

      continue;
    }

    // Claude gave a final text response
    if (response.stop_reason === 'end_turn') {
      for (const block of response.content) {
        if (block.type === 'text') {
          finalText = block.text;
          break;
        }
      }
      break;
    }

    break;
  }

  return finalText || "I'm sorry, something went wrong. Please try again.";
}

module.exports = { processMessage };