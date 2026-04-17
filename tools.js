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
  const { data } = await supabase
    .from('leads')
    .update(fields)
    .eq('id', leadId)
    .select()
    .single();
  return data;
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

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    return { properties: [], count: 0 };
  }

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
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', TENANT_ID)
    .single();

  const calendarId = process.env.SYDIA_CALENDAR_ID || tenant.google_calendar_id;
  const timezone = tenant.timezone || 'Africa/Nairobi';
  const companyName = tenant.company_name;

  const slots = typeof slotMap === 'string' ? JSON.parse(slotMap) : slotMap;
  const slotData = slots[slotNumber.toString()];
  if (!slotData) return { success: false, error: 'Invalid slot' };

  const [startTime, endTime] = slotData.split('|');
  const slotStart = new Date(startTime);
  const slotEnd = new Date(endTime);

  // Check conflict
  const { data: conflicts } = await supabase
    .from('bookings')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .neq('status', 'Cancelled')
    .lt('start_datetime', slotEnd.toISOString())
    .gt('end_datetime', slotStart.toISOString())
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    return { success: false, slotTaken: true };
  }

  const { data: property } = await supabase
    .from('properties')
    .select('property_name, address, price')
    .eq('id', propertyId)
    .single();

  const { data: agent } = await supabase
    .from('agents')
    .select('agent_name, phone')
    .eq('tenant_id', TENANT_ID)
    .eq('active', true)
    .single();

  const agentName = agent?.agent_name || null;
  const agentPhone = agent?.phone || null;

  // Create calendar event
  const event = {
    summary: `${companyName} - Property Viewing`,
    description:
      `Property: ${property.property_name}\n` +
      `Client: ${leadName}\n` +
      `Phone: ${leadPhone}\n` +
      `Agent: ${agentName || 'N/A'}`,
    location: property.address,
    start: { dateTime: slotStart.toISOString(), timeZone: timezone },
    end: { dateTime: slotEnd.toISOString(), timeZone: timezone },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] }
  };

  let calendarEvent;
  try {
    calendarEvent = await calendar.events.insert({ calendarId, resource: event });
  } catch (err) {
    console.error('Calendar error:', err.message);
    return { success: false, error: 'Calendar error' };
  }

  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      lead_id: leadId,
      property_id: propertyId,
      tenant_id: TENANT_ID,
      start_datetime: slotStart.toISOString(),
      end_datetime: slotEnd.toISOString(),
      date: slotStart.toISOString().split('T')[0],
      time: slotStart.toLocaleTimeString('en-KE', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }),
      status: 'Scheduled',
      google_event_id: calendarEvent.data.id,
      agent_name: agentName,
      agent_phone: agentPhone
    })
    .select()
    .single();

  const bookingDate = slotStart.toLocaleDateString('en-KE', { timeZone: timezone });
  const bookingTime = slotStart.toLocaleTimeString('en-KE', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true });

  // Notify agent via Twilio template
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
          "4": `KES ${Number(property.price).toLocaleString()}`,
          "5": leadPhone || 'N/A',
          "6": 'Kilimani',
          "7": bookingDate,
          "8": bookingTime
        })
      });
      console.log('Agent notified:', agentPhone);
    } catch (err) {
      console.error('Agent notification error:', err.message);
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
  getLocations,
  getBedroomOptions,
  getCompletionDates,
  searchProperties,
  getAvailableSlots,
  createBooking,
  getConversationHistory,
  saveMessage
};