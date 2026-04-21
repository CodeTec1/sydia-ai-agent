const Anthropic = require('@anthropic-ai/sdk');
const tools = require('./tools');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = require('./systemPrompt');

// ============================================
// TOOL DEFINITIONS FOR CLAUDE
// ============================================
const TOOL_DEFINITIONS = [

  {
    name: 'get_available_options',
    description: 'Get all available property types, locations, and bedroom options from the database. Call this at the start of every conversation before answering any questions about what is available. This tells you exactly what Sydia Realty currently has in stock.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },

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

    case 'get_available_options': {
      return await tools.getAvailableOptions();
    }

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
      // GUARD: If lead already has search results and context has properties,
      // block unnecessary re-search unless criteria actually changed
      if (context.lastProperties && context.lastProperties.length > 0) {
        const existingInterest = context.lastProperties[0]?.location;
        const sameSearch = (
          toolInput.location?.toLowerCase() === context.lastSearchParams?.location?.toLowerCase() &&
          toolInput.interest?.toLowerCase() === context.lastSearchParams?.interest?.toLowerCase() &&
          toolInput.bedrooms === context.lastSearchParams?.bedrooms
        );

        if (sameSearch) {
          console.log('BLOCKED: Unnecessary re-search — returning cached results');
          return {
            properties: context.lastProperties,
            count: context.lastProperties.length,
            cached: true
          };
        }
      }

      const result = await tools.searchProperties(toolInput);

      if (result.properties && result.properties.length > 0) {
        // Only send property cards on first search, not cached returns
        if (!context.propertiesAlreadySent) {
          context.lastProperties = result.properties;
          context.propertiesAlreadySent = true;
        }

        // Store search params so we can detect duplicate searches
        context.lastSearchParams = {
          interest: toolInput.interest,
          location: toolInput.location,
          bedrooms: toolInput.bedrooms,
          budget: toolInput.budget
        };

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
      const propertyId = toolInput.propertyId || context.currentPropertyId;

      // Prevent double booking same property
      if (context.bookedPropertyIds.has(propertyId)) {
        console.log('Prevented duplicate booking for property:', propertyId);
        return {
          success: false,
          error: 'This property has already been booked in this session.',
          alreadyBooked: true
        };
      }

      const bookingInput = {
        leadId: context.leadId,
        propertyId,
        slotNumber: toolInput.slotNumber,
        slotMap: toolInput.slotMap || context.currentSlotMap,
        leadName: toolInput.leadName || context.leadName || 'Client',
        leadPhone: context.leadPhone
      };

      console.log('Booking input:', JSON.stringify(bookingInput));

      if (!bookingInput.slotMap) {
        return { success: false, error: 'No slot map available. Please get available slots first.' };
      }

      const result = await tools.createBooking(bookingInput);
      console.log('createBooking result:', JSON.stringify(result));

      if (result.success) {
        context.lastBooking = result;
        context.bookedPropertyIds.add(propertyId);  // Mark as booked
      }

      return result;
    }

    case 'cancel_booking': {
      const result = await tools.cancelBooking(context.leadId);
      return result;
    }

    case 'update_lead': {
      const id = context.leadId;
      if (!id) return { success: false, error: 'No lead ID' };

      // Filter to only fields that have actually changed
      const changedFields = {};
      const fields = toolInput.fields || {};

      const checkFields = ['name', 'interest', 'location', 'size', 'budget', 'is_offplan', 'completion_range', 'status'];

      for (const field of checkFields) {
        if (fields[field] !== undefined) {
          const incoming = fields[field]?.toString() || null;
          const existing = context.savedLeadData[field]?.toString() || null;
          if (incoming !== existing) {
            changedFields[field] = fields[field];
          }
        }
      }

      // Always allow non-tracked fields like search_results, available_slots, status
      const alwaysUpdate = ['search_results', 'available_slots', 'selected_property_id',
                            'last_viewed_property', 'awaiting_followup_response', 'notes'];
      for (const field of alwaysUpdate) {
        if (fields[field] !== undefined) {
          changedFields[field] = fields[field];
        }
      }

      if (Object.keys(changedFields).length === 0) {
        console.log('SKIPPED: update_lead — no new data to save');
        return { success: true, skipped: true, message: 'No changes detected' };
      }

      // Update context tracker
      for (const [key, value] of Object.entries(changedFields)) {
        if (context.savedLeadData.hasOwnProperty(key)) {
          context.savedLeadData[key] = value;
        }
      }

      if (changedFields.name || fields.name) {
        context.leadName = changedFields.name || fields.name;
      }

      console.log('update_lead — saving only changed fields:', JSON.stringify(changedFields));
      return await tools.updateLead(id, changedFields);
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

  // If lead already has search results from this session, mark as already sent
  const hasExistingSearchResults = lead.search_results &&
    Array.isArray(lead.search_results) &&
    lead.search_results.length > 0;

  const context = {
    leadId: lead.id,
    leadName: lead.name || null,
    leadPhone: cleanPhone,
    currentSlotMap: lead.available_slots || null,
    currentPropertyId: null,
    lastProperties: null,
    lastBooking: null,
    propertiesAlreadySent: hasExistingSearchResults,
    bookedPropertyIds: new Set(),
    lastSearchParams: null,
    savedLeadData: {
      name: lead.name || null,
      interest: lead.interest || null,
      location: lead.location || null,
      size: lead.size || null,
      budget: lead.budget || null,
      is_offplan: lead.is_offplan ?? null,
      completion_range: lead.completion_range || null
    }
  };

  console.log('Processing message for lead:', lead.id, '| Phone:', cleanPhone);

 let availableOptionsContext = '';
  try {
    const options = await tools.getAvailableOptions();

    if (options && options.locationSummary && options.locationSummary.length > 0) {
      const locationDetails = options.locationSummary.map(loc =>
        `  ${loc.location}: ${loc.bedrooms.join(', ')} | ` +
        `${loc.priceRange} | ` +
        `${loc.hasOffplan && loc.hasReady ? 'offplan + ready' : loc.hasOffplan ? 'offplan only' : 'ready only'}`
      ).join('\n');

      availableOptionsContext =
        `\n\nCURRENT DATABASE INVENTORY — THIS IS ALL YOU HAVE:\n` +
        `Property types: ${options.types.join(', ') || 'none'}\n` +
        `Overall price range: ${options.overallPriceRange || 'N/A'}\n` +
        `\nAvailable by location:\n${locationDetails}\n` +
        `\nHas offplan: ${options.hasOffplan ? 'Yes' : 'No'}\n` +
        `Has ready: ${options.hasReady ? 'Yes' : 'No'}\n\n` +
        `STRICT RULE: Only suggest locations, bedroom counts, and price ranges from this inventory. ` +
        `Never use outside knowledge. If asked about anything not in this list, say it is not available ` +
        `and offer what IS available from this list.`;
    }
  } catch (err) {
    console.error('Failed to load available options:', err.message);
    // Continue without inventory — do not crash the conversation
  }

  const context = {
    leadId: lead.id,
    leadName: lead.name || null,
    leadPhone: cleanPhone,
    currentSlotMap: lead.available_slots || null,
    currentPropertyId: null,
    lastProperties: null,
    lastBooking: null,
    propertiesAlreadySent: hasExistingSearchResults,
    bookedPropertyIds: new Set()  // Track what has been booked this session
  };
  
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
      system: SYSTEM_PROMPT + availableOptionsContext,
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