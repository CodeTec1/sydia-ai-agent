const supabase = require('./supabase');
const { google } = require('googleapis');

const TENANT_ID = process.env.SYDIA_TENANT_ID;

let credentials = {};
try {
  credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
} catch (err) {
  console.error('Invalid GOOGLE_SERVICE_ACCOUNT JSON — calendar features will not work');
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/calendar']
});
const calendar = google.calendar({ version: 'v3', auth });

const twilio = require('twilio');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const TEMPLATES = {
  BOOKING_CONFIRMED: 'HX2c2220034dc1ddab4aefbda53eddb5c5',  
  VIEWING_REMINDER: 'HXe2f13d97461952b669a22dd6a17081aa',    
  BOOKING_CANCELLED: 'HX1110acf915d7366c907299818993fa00',
  HOT_LEAD: 'HX8e8cfe432e7ae3256d6d5c343359d85e',
  NO_PROPERTY_FOUND: 'HX6b9d047af7d746a257c0099c9c34034e',
  ESCALATION: 'HX2d148682193946da5dcceadcb4f82b90',
  USER_REMINDER: 'HX83cf8d55cbc0b9c12527031e9a90fb7e',       
  USER_FOLLOWUP: 'HXb89f92fd9d2703e36be4959554dedd67'        
};

const SYDIA_WHATSAPP = process.env.SYDIA_WHATSAPP_NUMBER;

function formatKES(value) {
  const num = Number(value || 0);
  return isNaN(num) ? 'Price on request' : `KES ${num.toLocaleString()}`;
}

// ============================================
// TOOL: Get or create lead
// ============================================
async function getOrCreateLead(phone) {
  const { data: existing } = await supabase
    .from('leads')
    .select('*')
    .eq('phone', phone)
    .eq('tenant_id', TENANT_ID)
    .maybeSingle();

  if (existing) return existing;

  const { data: newLead } = await supabase
    .from('leads')
    .insert({
      phone,
      tenant_id: TENANT_ID,
      status: 'New',
      conversation_stage: 'ai_agent'
    })
    .select()
    .single();

  return newLead;
}

// ============================================
// TOOL: Update lead
// ============================================
async function updateLead(leadId, fields) {
  console.log('Updating lead:', leadId, '| Fields:', JSON.stringify(fields));

  if (!leadId) {
    console.error('updateLead called without leadId');
    return { success: false, error: 'No leadId provided' };
  }

  // Map Claude-friendly field names to actual DB column names
  const mapped = {};
  const skipColumns = ['bedrooms', 'leadId', 'leadName', 'leadPhone'];
  const fieldMap = {
    name: 'name',
    Name: 'name',
    budget: 'budget',
    Budget: 'budget',
    interest: 'interest',
    Interest: 'interest',
    location: 'location',
    Location: 'location',
    size: 'size',
    Size: 'size',
    status: 'status',
    Status: 'status',
    conversation_stage: 'conversation_stage',
    is_offplan: 'is_offplan',
    completion_range: 'completion_range',
    search_results: 'search_results',
    available_slots: 'available_slots',
    selected_property_id: 'selected_property_id',
    last_viewed_property: 'last_viewed_property',
    awaiting_followup_response: 'awaiting_followup_response',
    purpose: 'purpose',
    payment_method: 'payment_method',
    timeline: 'timeline',
    decision_maker: 'decision_maker',
    client_type: 'client_type',
    property_snapshot: 'property_snapshot',
    search_fingerprints: 'search_fingerprints',
    found_property_ids: 'found_property_ids',
    property_id_map: 'property_id_map',
    lead_source: 'lead_source'
  };

  for (const [key, value] of Object.entries(fields)) {
    if (skipColumns.includes(key)) continue;
    const dbKey = fieldMap[key] || key;
    // Convert budget to string if it is a number
    if (dbKey === 'budget' && typeof value === 'number') {
      mapped[dbKey] = value.toString();
    } else {
      mapped[dbKey] = value;
    }
  }

  console.log('Mapped update fields:', JSON.stringify(mapped));

  mapped['updated_at'] = new Date().toISOString();

  const { data, error } = await supabase
    .from('leads')
    .update(mapped)
    .eq('id', leadId)
    .select()
    .single();

  if (error) {
    console.error('updateLead DB error:', JSON.stringify(error));
    return { success: false, error: error.message };
  }

  // If status changed to Hot Lead, notify agent immediately
  if (mapped.status === 'Hot Lead') {
    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('name, phone, last_viewed_property')
        .eq('id', leadId)
        .single();

      const { data: agent } = await supabase
        .from('agents')
        .select('phone')
        .eq('tenant_id', TENANT_ID)
        .eq('active', true)
        .single();

      if (agent?.phone) {
        const agentWhatsApp = agent.phone.startsWith('whatsapp:')
          ? agent.phone
          : `whatsapp:${agent.phone}`;

        const cleanLeadPhone = lead?.phone
          ? lead.phone.replace('whatsapp:', '').trim()
          : 'N/A';

        await twilioClient.messages.create({
          from: SYDIA_WHATSAPP,
          to: agentWhatsApp,
          contentSid: TEMPLATES.HOT_LEAD,
          contentVariables: JSON.stringify({
            "1": lead?.name || 'Unknown',
            "2": cleanLeadPhone,
            "3": lead?.last_viewed_property || 'N/A'
          })
        });
        console.log('Hot lead alert sent to agent:', agent.phone);
      }
    } catch (notifyErr) {
      console.error('Hot lead notification error:', notifyErr.message);
    }
  }

  console.log('Lead updated successfully');
  return { success: true, data };
}

// ============================================
// TOOL: Get available options
// ============================================

async function getAvailableOptions() {
  const { data } = await supabase
    .from('properties')
    .select('type, location, bedrooms, is_offplan, price')
    .eq('tenant_id', TENANT_ID)
    .eq('available', true);

  if (!data || data.length === 0) {
    return {
      types: [],
      locations: [],
      bedrooms: [],
      hasOffplan: false,
      hasReady: false,
      priceRange: null,
      locationSummary: []
    };
  }

  const types = [...new Set(data.map(r => r.type).filter(Boolean))].sort();
  const locations = [...new Set(data.map(r => r.location).filter(Boolean))].sort();
  const bedrooms = [...new Set(
    data.map(r => parseInt(r.bedrooms)).filter(n => !isNaN(n))
  )].sort((a, b) => a - b);
  const hasOffplan = data.some(r => r.is_offplan === true);
  const hasReady = data.some(r => r.is_offplan === false);

  const prices = data.map(r => r.price).filter(p => p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  // Build per-location summary so Nina knows exactly what exists where
  const locationSummary = locations.map(loc => {
    const locProps = data.filter(r => r.location === loc);
    const locBeds = [...new Set(
      locProps.map(r => parseInt(r.bedrooms)).filter(n => !isNaN(n))
    )].sort((a, b) => a - b);
    const locPrices = locProps.map(r => r.price).filter(p => p > 0);
    const locMin = Math.min(...locPrices);
    const locMax = Math.max(...locPrices);
    const locTypes = [...new Set(locProps.map(r => r.type).filter(Boolean))];
    const locOffplan = locProps.some(r => r.is_offplan === true);
    const locReady = locProps.some(r => r.is_offplan === false);

    return {
      location: loc,
      types: locTypes,
      bedrooms: locBeds.map(b => b === 0 ? 'Studio' : `${b} bed`),
      priceRange: `KES ${Number(locMin).toLocaleString()} to KES ${Number(locMax).toLocaleString()}`,
      hasOffplan: locOffplan,
      hasReady: locReady
    };
  });

  return {
    types,
    locations,
    bedrooms,
    hasOffplan,
    hasReady,
    overallPriceRange: `KES ${Number(minPrice).toLocaleString()} to KES ${Number(maxPrice).toLocaleString()}`,
    locationSummary
  };
}

// ============================================
// TOOL: Get available locations
// ============================================
async function getLocations(interest) {
  const normalized = interest
    ? interest.charAt(0).toUpperCase() + interest.slice(1).toLowerCase()
    : '';

  const { data } = await supabase
    .from('properties')
    .select('location')
    .eq('tenant_id', TENANT_ID)
    .ilike('type', normalized)
    .eq('available', true);

  if (!data || data.length === 0) return { locations: [] };

  const locations = [...new Set(data.map(r => r.location).filter(Boolean))].sort();

  return { locations };
}

// ============================================
// TOOL: Get bedroom options
// ============================================
async function getBedroomOptions(interest, location) {
  const normalizedInterest = interest
  ? interest.charAt(0).toUpperCase() + interest.slice(1).toLowerCase()
  : '';
const normalizedLocation = location?.trim() || '';

  const { data } = await supabase
    .from('properties')
    .select('bedrooms')
    .eq('tenant_id', TENANT_ID)
    .ilike('type', normalizedInterest)
    .ilike('location', `%${normalizedLocation}%`)
    .eq('available', true);

  if (!data || data.length === 0) return { bedrooms: [] };

  const bedrooms = [...new Set(data.map(r => parseInt(r.bedrooms)).filter(n => !isNaN(n)))].sort((a, b) => a - b);
  return { bedrooms };
}

// ============================================
// TOOL: Get completion dates
// ============================================
async function getCompletionDates(interest, location, bedrooms = null, budget = null) {
  const normalizedInterest = interest
  ? interest.charAt(0).toUpperCase() + interest.slice(1).toLowerCase()
  : '';
const normalizedLocation = location?.trim() || '';

  let query = supabase
    .from('properties')
    .select('completion_date')
    .eq('tenant_id', TENANT_ID)
    .ilike('type', normalizedInterest)
    .ilike('location', `%${normalizedLocation}%`)
    .eq('available', true)
    .eq('is_offplan', true)
    .not('completion_date', 'is', null);

  if (bedrooms !== null) query = query.eq('bedrooms', bedrooms);
  if (budget) query = query.lte('price', parseFloat(budget) * 1.2);

  const { data } = await query;
  if (!data || data.length === 0) return { dates: [] };

  const dates = [...new Set(data.map(r => r.completion_date).filter(Boolean))].sort();
  return { dates };
}

// ============================================
// TOOL: Search properties
// ============================================
async function searchProperties({
  interest,
  location,
  bedrooms,
  budget,
  isOffplan,
  completionDate
} = {}) {

  try {

    // =====================================================
    // NORMALIZATION
    // No forced casing — ILIKE already handles case
    // =====================================================

    const normalizedInterest =
      interest?.trim() || '';

    const normalizedLocation =
      location?.trim() || '';

    // =====================================================
    // HARD GUARD
    // =====================================================

    if (!normalizedLocation) {
      console.error(
        'searchProperties called with empty location'
      );

      return {
        properties: [],
        count: 0,
        error: 'Missing location'
      };
    }

    // =====================================================
    // BASE QUERY
    // =====================================================

    let query = supabase
      .from('properties')
      .select(`
        id,
        property_name,
        project_name,
        type,
        price,
        bedrooms,
        sqm,
        plot_size,
        location,
        address,
        photo_url,
        description,
        completion_date,
        is_offplan
      `)
      .eq('tenant_id', TENANT_ID)
      .eq('available', true)
      .order('price', { ascending: true })
      .limit(5);

    // =====================================================
    // FILTERS
    // =====================================================

    if (normalizedInterest) {
      query = query.ilike(
        'type',
        `%${normalizedInterest}%`
      );
    }

    if (normalizedLocation) {
      query = query.ilike(
        'location',
        `%${normalizedLocation}%`
      );
    }

    if (
      bedrooms !== undefined &&
      bedrooms !== null
    ) {
      query = query.eq(
        'bedrooms',
        parseInt(bedrooms)
      );
    }

    if (budget) {

      const budgetNum = parseFloat(
        budget.toString().replace(/[^0-9.]/g, '')
      );

      if (!isNaN(budgetNum) && budgetNum > 0) {
        query = query.lte(
          'price',
          budgetNum * 1.2
        );
      }
    }

    if (isOffplan === true) {

      query = query.eq('is_offplan', true);

      if (completionDate) {
        query = query.ilike(
          'completion_date',
          `%${completionDate}%`
        );
      }

    } else if (isOffplan === false) {

      query = query.eq('is_offplan', false);
    }

    // =====================================================
    // RUN QUERY
    // =====================================================

    const { data, error } = await query;

    // =====================================================
    // NO RESULTS → SUGGEST ALTERNATIVES
    // =====================================================

    if (error || !data || data.length === 0) {

      if (error) {
        console.error(
          'Search error:',
          error.message
        );
      }

      const { data: alternatives } = await supabase
        .from('properties')
        .select(`
          bedrooms,
          price,
          completion_date,
          location
        `)
        .eq('tenant_id', TENANT_ID)
        .eq('available', true)
        .ilike('type', `%${normalizedInterest}%`)
        .ilike('location', `%${normalizedLocation}%`)
        .limit(10);

      let suggestion = null;

      if (
        alternatives &&
        alternatives.length > 0
      ) {

        const beds = [
          ...new Set(
            alternatives
              .map(r => r.bedrooms)
              .filter(Boolean)
          )
        ].sort();

        const prices = alternatives
          .map(r => r.price)
          .filter(Boolean);

        const minPrice =
          prices.length > 0
            ? Math.min(...prices)
            : 0;

        const maxPrice =
          prices.length > 0
            ? Math.max(...prices)
            : 0;

        suggestion = {
          availableBedrooms: beds,

          priceRange: {
            min: `KES ${Number(minPrice).toLocaleString()}`,
            max: `KES ${Number(maxPrice).toLocaleString()}`
          }
        };
      }

      return {
        properties: [],
        count: 0,
        suggestion
      };
    }

    // =====================================================
    // CLIENT-FACING CLEAN PROPERTIES
    // IMPORTANT:
    // NO RAW UUIDS EXPOSED TO CLAUDE
    // =====================================================

    const properties = data.map((p, i) => ({

      // Claude uses ONLY this number
      number: i + 1,

      // NEVER expose p.id here
      name: p.property_name,

      project: p.project_name || null,

      price: p.price
        ? `KES ${Number(p.price).toLocaleString()}`
        : 'Price on request',

      rawPrice: p.price || 0,

      bedrooms: p.bedrooms,

      sqm: p.sqm || null,

      location: p.location,

      address: p.address,

      completion: p.completion_date || null,

      isOffplan: p.is_offplan || false,

      description: p.description || null,

      photo: p.photo_url || null
    }));

    // =====================================================
    // INTERNAL BACKEND-ONLY ID MAP
    // NEVER SHOW THIS TO CLAUDE DIRECTLY
    // =====================================================

    const propertyIdMap = {};

    data.forEach((p, i) => {
      propertyIdMap[i + 1] = p.id;
    });

    // =====================================================
    // RETURN
    // =====================================================

    return {
      properties,
      propertyIdMap,
      count: properties.length
    };

  } catch (err) {

    console.error(
      'searchProperties error:',
      err.message
    );

    return {
      properties: [],
      count: 0
    };
  }
}

// ============================================
// TOOL: Get available slots
// ============================================
async function getAvailableSlots(propertyId) {
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', TENANT_ID)
    .single();

  const workStart = Number(tenant.work_start_hour);
  const workEnd = Number(tenant.work_end_hour);
  const slotDuration = Number(tenant.slot_duration);

  if (isNaN(workStart) || isNaN(workEnd) || isNaN(slotDuration)) {
    console.error('Invalid tenant configuration:', tenant);
    return { slots: [], slotMap: {}, count: 0, error: 'Invalid tenant configuration' };
  }

  const calendarId = process.env.SYDIA_CALENDAR_ID || tenant.google_calendar_id;
  const timezone = tenant.timezone || 'Africa/Nairobi';
  const daysAhead = parseInt(tenant.days_ahead || 30);
  const workingDaysStr = tenant.working_days || 'Monday,Tuesday,Wednesday,Thursday,Friday';
  const KENYA_OFFSET = 3;

  const now = new Date();
  const searchEnd = new Date(now);
  searchEnd.setDate(searchEnd.getDate() + daysAhead);

  const calResponse = await calendar.events.list({
    calendarId,
    timeMin: now.toISOString(),
    timeMax: searchEnd.toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  });

  const booked = (calResponse.data.items || []).map(e => ({
    start: new Date(e.start.dateTime || e.start.date),
    end: new Date(e.end.dateTime || e.end.date)
  }));

  // Also check agent bookings in Supabase for time blocking
  const { data: agentBookings } = await supabase
    .from('bookings')
    .select('start_datetime, end_datetime')
    .eq('tenant_id', TENANT_ID)
    .neq('status', 'Cancelled')
    .gte('end_datetime', now.toISOString());

  const allBooked = [
    ...booked,
    ...(agentBookings || []).map(b => ({
      start: new Date(b.start_datetime),
      end: new Date(b.end_datetime)
    }))
  ];

  function overlaps(start, end) {
    return allBooked.some(b => start < b.end && end > b.start);
  }

  function isWorkingDay(d) {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    return workingDaysStr.includes(days[d.getDay()]);
  }

  const minSlotTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  const freeSlots = [];

  for (let dayOffset = 0; dayOffset < daysAhead && freeSlots.length < 7; dayOffset++) {
    const day = new Date(now);
    day.setDate(day.getDate() + dayOffset);
    day.setHours(0, 0, 0, 0);
    if (!isWorkingDay(day)) continue;

    let currentMinutes = workStart * 60;

    while (currentMinutes < workEnd * 60 && freeSlots.length < 7) {
      const slotHour = Math.floor(currentMinutes / 60);
      const slotMinute = currentMinutes % 60;

      const utcHour = slotHour - KENYA_OFFSET;
      const slotStart = new Date(Date.UTC(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        utcHour,
        slotMinute,
        0, 0
      ));

      const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

      if (slotStart <= minSlotTime) {
        currentMinutes += slotDuration;
        continue;
      }

      if (overlaps(slotStart, slotEnd)) {
        currentMinutes += slotDuration;
        continue;
      }

      freeSlots.push({
        number: freeSlots.length + 1,
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        display: slotStart.toLocaleString('en-KE', {
          timeZone: timezone,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      });

      currentMinutes += slotDuration;
    }
  }

  const slotMap = {};
  freeSlots.forEach(s => { slotMap[s.number] = `${s.start}|${s.end}`; });

  return { slots: freeSlots, slotMap, count: freeSlots.length };
}

// ============================================
// TOOL: Create booking
// ============================================
async function createBooking({ leadId, propertyId, slotNumber, slotMap, leadName, leadPhone }) {
  console.log('=== CREATE BOOKING CALLED ===');
  console.log('leadId:', leadId);
  console.log('propertyId:', propertyId);
  console.log('slotNumber:', slotNumber);
  console.log('leadName:', leadName);
  console.log('leadPhone:', leadPhone);
  console.log('slotMap type:', typeof slotMap);
  console.log('slotMap preview:', JSON.stringify(slotMap).substring(0, 100));

  if (!leadId) return { success: false, error: 'Missing leadId' };
  if (!propertyId) return { success: false, error: 'Missing propertyId' };
  if (!slotNumber) return { success: false, error: 'Missing slotNumber' };
  if (!slotMap) return { success: false, error: 'Missing slotMap' };

  try {
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', TENANT_ID)
      .single();

    if (tenantError) {
      console.error('Tenant fetch error:', tenantError);
      return { success: false, error: 'Could not fetch tenant config' };
    }

    const calendarId = process.env.SYDIA_CALENDAR_ID || tenant.google_calendar_id;
    const timezone = tenant.timezone || 'Africa/Nairobi';
    const companyName = tenant.company_name;

    // Parse slot map
    let slots;
    try {
      slots = typeof slotMap === 'string' ? JSON.parse(slotMap) : slotMap;
    } catch (e) {
      console.error('Failed to parse slotMap:', e.message);
      return { success: false, error: 'Invalid slot map format' };
    }

    const slotKey = slotNumber.toString();
    const slotData = slots[slotKey];
    console.log('Looking up slot key:', slotKey);
    console.log('Available keys:', Object.keys(slots));
    console.log('Slot data:', slotData);

    if (!slotData || !slotData.includes('|')) {
      return {
        success: false,
        slotExpired: true,
        error: `Slot ${slotNumber} is no longer available. Please get fresh slots.`
      };
    }

    const [startTime, endTime] = slotData.split('|');
    const slotStart = new Date(startTime);
    const slotEnd = new Date(endTime);

    console.log('Slot start:', slotStart.toISOString());
    console.log('Slot end:', slotEnd.toISOString());

    // Check for conflicts
    const { data: conflicts } = await supabase
      .from('bookings')
      .select('id')
      .eq('tenant_id', TENANT_ID)
      .neq('status', 'Cancelled')
      .lt('start_datetime', slotEnd.toISOString())
      .gt('end_datetime', slotStart.toISOString())
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      console.log('Slot conflict detected');
      return { success: false, slotTaken: true, error: 'That slot is already taken' };
    }

    // Check for duplicate — same lead booking same property same day
    const bookingDate = slotStart.toISOString().split('T')[0];
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('lead_id', leadId)
      .eq('property_id', propertyId)
      .eq('date', bookingDate)
      .neq('status', 'Cancelled')
      .limit(1);

    if (existingBooking && existingBooking.length > 0) {
      console.log('Duplicate booking prevented for lead:', leadId, 'property:', propertyId);
      return {
        success: false,
        duplicate: true,
        error: 'A booking already exists for this property on this date.'
      };
    }

    // Get property details
    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('property_name, address, price, agents(agent_name, phone, email)')
      .eq('id', propertyId)
      .single();

    if (propertyError || !property) {
      console.error('Property fetch error:', propertyError);
      return { success: false, error: 'Could not find property' };
    }

    console.log('Property found:', property.property_name);

    // Get lead budget for notification
    const { data: leadRecord } = await supabase
      .from('leads')
      .select('budget')
      .eq('id', leadId)
      .single();

    const leadBudget = leadRecord?.budget
      ? `KES ${Number(leadRecord.budget).toLocaleString()}`
      : 'N/A';

    // Get agent — try from property first, then fall back to active agent
    let agentName = property.agents?.agent_name || null;
    let agentPhone = property.agents?.phone || null;

    if (!agentPhone) {
      const { data: fallbackAgent } = await supabase
        .from('agents')
        .select('agent_name, phone')
        .eq('tenant_id', TENANT_ID)
        .eq('active', true)
        .single();

      agentName = fallbackAgent?.agent_name || null;
      agentPhone = fallbackAgent?.phone || null;
    }

    console.log('Agent:', agentName, agentPhone);

    // Create Google Calendar event
    const bookingDateFormatted = slotStart.toLocaleDateString('en-KE', { timeZone: timezone });
    const bookingTime = slotStart.toLocaleTimeString('en-KE', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const event = {
      summary: `${companyName} - Property Viewing`,
      description:
        `Property: ${property.property_name}\n` +
        `Client: ${leadName || 'Unknown'}\n` +
        `Phone: ${leadPhone || 'N/A'}\n` +
        `Agent: ${agentName || 'N/A'}`,
      location: property.address,
      start: { dateTime: slotStart.toISOString(), timeZone: timezone },
      end: { dateTime: slotEnd.toISOString(), timeZone: timezone },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 60 }]
      }
    };

    let calendarEventId = null;
    try {
      const calendarEvent = await calendar.events.insert({
        calendarId,
        resource: event
      });
      calendarEventId = calendarEvent.data.id;
      console.log('Calendar event created:', calendarEventId);
    } catch (calErr) {
      console.error('Calendar error (non-fatal):', calErr.message);
      // Continue even if calendar fails — booking in DB is more important
    }

    // Create booking in Supabase
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        lead_id: leadId,
        property_id: propertyId,
        tenant_id: TENANT_ID,
        start_datetime: slotStart.toISOString(),
        end_datetime: slotEnd.toISOString(),
        date: slotStart.toISOString().split('T')[0],
        time: bookingTime,
        status: 'Scheduled',
        google_event_id: calendarEventId,
        agent_name: agentName,
        agent_phone: agentPhone
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Supabase booking error:', JSON.stringify(bookingError));
      return { success: false, error: `Database error: ${bookingError.message}` };
    }

    console.log('Booking created in DB:', booking.id);

    // Update lead status
    await supabase
      .from('leads')
      .update({
        status: 'Booked',
        conversation_stage: 'booking_confirmed',
        last_viewed_property: property.property_name
      })
      .eq('id', leadId);

    // Notify agent via WhatsApp template
    if (agentPhone) {
      try {
        const agentWhatsApp = agentPhone.startsWith('whatsapp:')
          ? agentPhone
          : `whatsapp:${agentPhone}`;

        await twilioClient.messages.create({
          from: SYDIA_WHATSAPP,
          to: agentWhatsApp,
          contentSid: TEMPLATES.BOOKING_CONFIRMED,
          contentVariables: JSON.stringify({
            "1": leadName || 'Unknown',
            "2": leadPhone || 'N/A',
            "3": property.property_name,
            "4": `KES ${Number(property.price || 0).toLocaleString()}`,
            "5": leadBudget,
            "6": property.address || 'N/A',
            "7": bookingDate,
            "8": bookingTime
          })
        });
        console.log('Agent notified at:', agentPhone);
      } catch (notifyErr) {
        console.error('Agent notification error:', notifyErr.message);
      }
    }

    return {
      success: true,
      bookingId: booking.id,
      property: property.property_name,
      address: property.address,
      price: `KES ${Number(property.price).toLocaleString()}`,
      date: bookingDate,
      time: bookingTime,
      agentName,
      agentPhone
    };

  } catch (err) {
    console.error('createBooking unexpected error:', err.message);
    console.error('Stack:', err.stack);
    return { success: false, error: err.message };
  }
}

// ============================================
// TOOL: Get conversation history
// ============================================
async function getConversationHistory(leadId) {
  const { data } = await supabase
    .from('conversation_history')
    .select('role, content, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(10);

  return data || [];
}

async function cancelBooking(leadId) {
  console.log('Cancelling booking for lead:', leadId);

  // Find the most recent active booking
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, google_event_id, start_datetime, property_id, agent_phone, agent_name, properties(property_name, address)')
    .eq('lead_id', leadId)
    .eq('status', 'Scheduled')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !bookings || bookings.length === 0) {
    return { success: false, error: 'No active booking found to cancel' };
  }

  const booking = bookings[0];

  // Delete from Google Calendar
  if (booking.google_event_id) {
    try {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('google_calendar_id')
        .eq('id', TENANT_ID)
        .single();

      await calendar.events.delete({
        calendarId: process.env.SYDIA_CALENDAR_ID || tenant.google_calendar_id,
        eventId: booking.google_event_id
      });
      console.log('Calendar event deleted');
    } catch (calErr) {
      console.error('Calendar deletion error (non-fatal):', calErr.message);
    }
  }

  // Update booking status
  await supabase
    .from('bookings')
    .update({ status: 'Cancelled' })
    .eq('id', booking.id);

  // Update lead
  await supabase
    .from('leads')
    .update({ status: 'Cancelled', conversation_stage: 'booking_cancelled' })
    .eq('id', leadId);

  // Notify agent
  if (booking.agent_phone) {
    try {
      const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('name, phone')
      .eq('id', leadId)
      .single();

    const leadName = lead?.name || 'Client';
    const leadPhone = lead?.phone
      ? lead.phone.replace('whatsapp:', '').trim()
      : 'N/A';

      const agentWhatsApp = booking.agent_phone.startsWith('whatsapp:')
        ? booking.agent_phone
        : `whatsapp:${booking.agent_phone}`;

      await twilioClient.messages.create({
        from: SYDIA_WHATSAPP,
        to: agentWhatsApp,
        contentSid: TEMPLATES.BOOKING_CANCELLED,
        contentVariables: JSON.stringify({
          "1": leadName,
          "2": leadPhone
        })
      });
      console.log('Agent notified of cancellation');
    } catch (notifyErr) {
      console.error('Agent cancellation notification error:', notifyErr.message);
    }
  }

  return {
    success: true,
    property: booking.properties?.property_name || 'your property',
    date: new Date(booking.start_datetime).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi' }),
    time: new Date(booking.start_datetime).toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  };
}

// ============================================
// TOOL: Save message to history
// ============================================
async function saveMessage(leadId, role, content) {
  await supabase
    .from('conversation_history')
    .insert({ lead_id: leadId, role, content });
}

// ============================================
// TOOL: Escalate to Agent
// ============================================

async function escalateToAgent(leadId, reason) {
  console.log('Escalating to agent for lead:', leadId, '| Reason:', reason);

  try {
    // ============================================
    // Fetch lead details
    // ============================================

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('name, phone, interest, budget, location, size, notes')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError) {
      console.error('Lead fetch error:', leadError.message);
    }

    // ============================================
    // Try property-specific agent first
    // ============================================

    let agent = null;

    if (lead?.location) {
      const { data: propertyAgent, error: propertyAgentError } = await supabase
        .from('properties')
        .select(`
          agents (
            agent_name,
            phone
          )
        `)
        .eq('tenant_id', TENANT_ID)
        .ilike('location', `%${lead.location}%`)
        .not('agent_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (propertyAgentError) {
        console.error('Property agent query error:', propertyAgentError.message);
      }

      if (propertyAgent?.agents?.phone) {
        agent = propertyAgent.agents;

        console.log(
          'Using property-specific agent:',
          agent.agent_name
        );
      }
    }

    // ============================================
    // Fallback to any active agent
    // ============================================

    if (!agent) {
      const { data: activeAgent, error: agentError } = await supabase
        .from('agents')
        .select('agent_name, phone')
        .eq('tenant_id', TENANT_ID)
        .eq('active', true)
        .limit(1)
        .maybeSingle();

      console.log(
        'Active agent query result:',
        JSON.stringify(activeAgent),
        '| Error:',
        agentError?.message
      );

      if (activeAgent?.phone) {
        agent = activeAgent;

        console.log(
          'Using fallback active agent:',
          agent.agent_name
        );
      }
    }

    // ============================================
    // No agent found
    // ============================================

    if (!agent?.phone) {
      console.error(
        'No agent found for escalation. tenant_id:',
        TENANT_ID
      );

      // Still mark lead as escalated
      await supabase
        .from('leads')
        .update({
          status: 'Contacted',
          conversation_stage: 'escalated'
        })
        .eq('id', leadId);

      // IMPORTANT:
      // Return success so Nina never tells client
      // "agents unavailable"
      return {
        success: true,
        agentNotified: false,
        message: 'Escalation logged but no active agent found'
      };
    }

    // ============================================
    // Prepare lead details
    // ============================================

    const clientName = lead?.name || 'Unknown';

    const clientPhone =
      lead?.phone?.replace('whatsapp:', '').trim() || 'N/A';

    const interest = lead?.interest || '';

    const size = lead?.size || '';

    const location = lead?.location || '';

    const budget = lead?.budget
      ? `KES ${Number(lead.budget).toLocaleString()}`
      : 'N/A';

    const propertySummary =
      `${size} in ${location}`.trim() || interest || 'N/A';

    // ============================================
    // Normalize agent WhatsApp number
    // ============================================

    const agentWhatsApp = agent.phone.startsWith('whatsapp:')
      ? agent.phone
      : `whatsapp:${agent.phone}`;

    // ============================================
    // Send Twilio template message
    // ============================================

    await twilioClient.messages.create({
      from: SYDIA_WHATSAPP,
      to: agentWhatsApp,

      // USE CENTRALIZED TEMPLATE CONFIG
      contentSid: TEMPLATES.ESCALATION,

      contentVariables: JSON.stringify({
        "1": clientName,
        "2": clientPhone,
        "3": propertySummary,
        "4": reason
      })
    });

    console.log(
      'Agent notified successfully via template:',
      agent.phone
    );

    // ============================================
    // Update lead status
    // ============================================

    await supabase
      .from('leads')
      .update({
        status: 'Contacted',
        conversation_stage: 'escalated'
      })
      .eq('id', leadId);

    // ============================================
    // Success
    // ============================================

    return {
      success: true,
      agentName: agent.agent_name,
      agentNotified: true
    };

  } catch (err) {

    // ============================================
    // Catch ALL failures
    // ============================================

    console.error('Escalation error:', err.message);

    // Still update lead stage
    try {
      await supabase
        .from('leads')
        .update({
          conversation_stage: 'escalated'
        })
        .eq('id', leadId);

    } catch (updateErr) {
      console.error(
        'Failed to update escalation stage:',
        updateErr.message
      );
    }

    // IMPORTANT:
    // Always return success so Nina NEVER says:
    // "agents unavailable"
    return {
      success: true,
      agentNotified: false,
      message: 'Escalation logged'
    };
  }
}

// ============================================
// Generate session summary using Claude
// ============================================
async function generateSessionSummary(conversationHistory) {
  if (!conversationHistory || conversationHistory.length === 0) return null;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const historyText = conversationHistory
      .slice(-20) // Last 20 messages only
      .map(h => `${h.role}: ${h.content}`)
      .join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', // Use cheapest model for summary
      max_tokens: 200,
      messages: [{
        role: 'user',
        content:
          `Summarize this property search conversation in 2-3 sentences. ` +
          `Focus on: what the client was looking for, what properties were shown, ` +
          `whether a booking was made or cancelled, and the outcome.\n\n` +
          `Conversation:\n${historyText}`
      }]
    });

    return response.content[0]?.text || null;
  } catch (err) {
    console.error('Summary generation error:', err.message);
    return null;
  }
}

// ============================================
// Clear conversation history
// ============================================
async function clearConversationHistory(leadId) {
  await supabase
    .from('conversation_history')
    .delete()
    .eq('lead_id', leadId);
  console.log('Conversation history cleared:', leadId);
}

module.exports = {
  getOrCreateLead,
  updateLead,
  getAvailableOptions, 
  getLocations,
  getBedroomOptions,
  generateSessionSummary,
  clearConversationHistory,
  getCompletionDates,
  searchProperties,
  getAvailableSlots,
  createBooking,
  cancelBooking,
  getConversationHistory,
  saveMessage,
  escalateToAgent
};