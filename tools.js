const supabase = require('./supabase');
const { google } = require('googleapis');

const TENANT_ID = process.env.SYDIA_TENANT_ID;

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
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
  BOOKING_CONFIRMED: 'HX9eed3c1924829f0ae1ecab49e84d99d9',
  BOOKING_CANCELLED: 'HX1110acf915d7366c907299818993fa00',
  HOT_LEAD: 'HX8e8cfe432e7ae3256d6d5c343359d85e',
  NO_PROPERTY_FOUND: 'HX6b9d047af7d746a257c0099c9c34034e'
};

const SYDIA_WHATSAPP = process.env.SYDIA_WHATSAPP_NUMBER;

// ============================================
// TOOL: Get or create lead
// ============================================
async function getOrCreateLead(phone, name = null) {
  const { data: existing } = await supabase
    .from('leads')
    .select('*')
    .eq('phone', phone)
    .eq('tenant_id', TENANT_ID)
    .single();

  if (existing) return existing;

  const { data: newLead } = await supabase
    .from('leads')
    .insert({
      phone,
      tenant_id: TENANT_ID,
      name: name || null,
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
    awaiting_followup_response: 'awaiting_followup_response'
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
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

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
  const normalized = interest.charAt(0).toUpperCase() + interest.slice(1).toLowerCase();

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
  const normalizedInterest = interest.charAt(0).toUpperCase() + interest.slice(1).toLowerCase();
  const normalizedLocation = location.charAt(0).toUpperCase() + location.slice(1).toLowerCase();

  const { data } = await supabase
    .from('properties')
    .select('bedrooms')
    .eq('tenant_id', TENANT_ID)
    .ilike('type', normalizedInterest)
    .ilike('location', normalizedLocation)
    .eq('available', true);

  if (!data || data.length === 0) return { bedrooms: [] };

  const bedrooms = [...new Set(data.map(r => parseInt(r.bedrooms)).filter(n => !isNaN(n)))].sort((a, b) => a - b);
  return { bedrooms };
}

// ============================================
// TOOL: Get completion dates
// ============================================
async function getCompletionDates(interest, location, bedrooms = null, budget = null) {
  const normalizedInterest = interest.charAt(0).toUpperCase() + interest.slice(1).toLowerCase();
  const normalizedLocation = location.charAt(0).toUpperCase() + location.slice(1).toLowerCase();

  let query = supabase
    .from('properties')
    .select('completion_date')
    .eq('tenant_id', TENANT_ID)
    .ilike('type', normalizedInterest)
    .ilike('location', normalizedLocation)
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
async function searchProperties({ interest, location, bedrooms, budget, isOffplan, completionDate }) {
  const normalizedInterest = interest.charAt(0).toUpperCase() + interest.slice(1).toLowerCase();
  const normalizedLocation = location.charAt(0).toUpperCase() + location.slice(1).toLowerCase();

  let query = supabase
    .from('properties')
    .select('id, property_name, project_name, type, price, bedrooms, sqm, plot_size, location, address, photo_url, description, completion_date, is_offplan')
    .eq('tenant_id', TENANT_ID)
    .ilike('type', normalizedInterest)
    .ilike('location', normalizedLocation)
    .eq('available', true)
    .order('price', { ascending: true })
    .limit(5);

  if (budget) {
    const budgetNum = parseFloat(budget.toString().replace(/[^0-9.]/g, ''));
    if (budgetNum > 0) query = query.lte('price', budgetNum * 1.2);
  }

  if (isOffplan === true) {
    query = query.eq('is_offplan', true);
    if (completionDate) query = query.ilike('completion_date', `%${completionDate}%`);
  } else if (isOffplan === false) {
    query = query.eq('is_offplan', false);
  }

  if (normalizedInterest !== 'Land' && bedrooms !== null && bedrooms !== undefined) {
    query = query.eq('bedrooms', parseInt(bedrooms));
  }

  // ✅ RUN QUERY ONCE
  const { data, error } = await query;

  // ❌ If no results → try alternatives
  if (error || !data || data.length === 0) {

    const { data: alternatives } = await supabase
      .from('properties')
      .select('bedrooms, price, completion_date, location')
      .eq('tenant_id', TENANT_ID)
      .ilike('type', normalizedInterest)
      .ilike('location', normalizedLocation)
      .eq('available', true)
      .limit(10);

    let suggestion = null;

    if (alternatives && alternatives.length > 0) {
      const beds = [...new Set(alternatives.map(r => r.bedrooms).filter(Boolean))].sort();
      const prices = alternatives.map(r => r.price).filter(Boolean);

      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);

      suggestion = {
        availableBedrooms: beds,
        priceRange: {
          min: `KES ${Number(minPrice).toLocaleString()}`,
          max: `KES ${Number(maxPrice).toLocaleString()}`
        }
      };
    }

    return { properties: [], count: 0, suggestion };
  }

  // ✅ Format results
  const properties = data.map((p, i) => ({
    number: i + 1,
    id: p.id,
    name: p.property_name,
    project: p.project_name || null,
    price: `KES ${Number(p.price).toLocaleString()}`,
    rawPrice: p.price,
    bedrooms: p.bedrooms,
    sqm: p.sqm,
    location: p.location,
    address: p.address,
    completion: p.completion_date || null,
    isOffplan: p.is_offplan,
    description: p.description || null,
    photo: p.photo_url || null
  }));

  return { properties, count: properties.length };
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

  const calendarId = process.env.SYDIA_CALENDAR_ID || tenant.google_calendar_id;
  const workStart = parseInt(tenant.work_start_hour || 9);
  const workEnd = parseInt(tenant.work_end_hour || 17);
  const slotDuration = parseInt(tenant.slot_duration || 60);
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

    for (let hour = workStart; hour < workEnd && freeSlots.length < 7;) {
      const slotStart = new Date(day);
      slotStart.setUTCHours(hour - KENYA_OFFSET, 0, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);

      if (slotStart <= minSlotTime) { hour++; continue; }
      if (overlaps(slotStart, slotEnd)) { hour++; continue; }

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

      hour = Math.floor((hour * 60 + slotDuration) / 60);
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
        error: `Invalid slot number ${slotNumber}. Available slots: ${Object.keys(slots).join(', ')}`
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
    const bookingDate = slotStart.toLocaleDateString('en-KE', { timeZone: timezone });
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
    .select('role, content')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
    .limit(30);

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

module.exports = {
  getOrCreateLead,
  updateLead,
  getAvailableOptions, 
  getLocations,
  getBedroomOptions,
  getCompletionDates,
  searchProperties,
  getAvailableSlots,
  createBooking,
  cancelBooking,
  getConversationHistory,
  saveMessage
};