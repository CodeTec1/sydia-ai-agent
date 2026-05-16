// notifications.js - Reminders and followups for Sydia AI Agent
require('dotenv').config();
const supabase = require('./supabase');
const twilio = require('twilio');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const SYDIA_WHATSAPP = process.env.SYDIA_WHATSAPP_NUMBER;
const TENANT_ID = process.env.SYDIA_TENANT_ID;

const TEMPLATES = {
  USER_REMINDER: 'HX83cf8d55cbc0b9c12527031e9a90fb7e',
  USER_FOLLOWUP: 'HXb89f92fd9d2703e36be4959554dedd67',
  VIEWING_REMINDER: 'HXe2f13d97461952b669a22dd6a17081aa'
};

async function sendMessage(to, body) {
  try {
    const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    await twilioClient.messages.create({
      from: SYDIA_WHATSAPP,
      to: toFormatted,
      body
    });
    console.log('Message sent to:', to);
  } catch (err) {
    console.error('Send message error:', err.message);
  }
}

async function sendTemplateToAgent(agentPhone, templateSid, variables) {
  try {
    if (!agentPhone) return;
    const agentWhatsApp = agentPhone.startsWith('whatsapp:')
      ? agentPhone
      : `whatsapp:${agentPhone}`;

    await twilioClient.messages.create({
      from: SYDIA_WHATSAPP,
      to: agentWhatsApp,
      contentSid: templateSid,
      contentVariables: JSON.stringify(variables)
    });
    console.log('Template sent to agent:', agentPhone);
  } catch (err) {
    console.error('Template error:', err.message);
  }
}

// ============================================
// 12-HOUR REMINDER
// ============================================
async function send12HourReminders() {
  const now = new Date();
  const in12Hours = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const in11Hours = new Date(now.getTime() + 11 * 60 * 60 * 1000);

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      start_datetime,
      agent_name,
      agent_phone,
      leads(name, phone),
      properties(property_name, address)
    `)
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'Scheduled')
    .eq('reminder_12h_sent', false)
    .gt('start_datetime', in11Hours.toISOString())
    .lt('start_datetime', in12Hours.toISOString());

  if (error) {
    console.error('12h reminder query error:', error.message);
    return;
  }

  console.log(`12h reminders to send: ${bookings?.length || 0}`);

  for (const booking of bookings || []) {
    const leadName = booking.leads?.name || 'there';
    const leadPhone = booking.leads?.phone;
    const propertyName = booking.properties?.property_name || 'the property';
    const propertyAddress = booking.properties?.address || '';
    const agentName = booking.agent_name || 'your agent';
    const agentPhone = booking.agent_phone;

    const startDate = new Date(booking.start_datetime);

    // Format date and time separately to match template variables
    const formattedDate = startDate.toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });

    const formattedTime = startDate.toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const humanReadableDateTime = `${formattedDate} at ${formattedTime}`;

    // Send to client via approved template
    if (leadPhone) {
      try {
        await twilioClient.messages.create({
          from: SYDIA_WHATSAPP,
          to: leadPhone,
          contentSid: TEMPLATES.USER_REMINDER,
          contentVariables: JSON.stringify({
            "1": leadName,
            "2": propertyName,
            "3": formattedDate,
            "4": formattedTime,
            "5": propertyAddress
          })
        });
        console.log('12h reminder sent to client via template:', leadPhone);
      } catch (err) {
        console.error('Failed to send 12h reminder to client:', err.message);
      }
    }

    // Send to agent via template with CORRECT variable mapping
    // {{1}} = Client name, {{2}} = Phone, {{3}} = Property, {{4}} = Address, {{5}} = Date, {{6}} = Time
    if (agentPhone) {
      await sendTemplateToAgent(agentPhone, TEMPLATES.VIEWING_REMINDER, {
        "1": leadName,
        "2": leadPhone?.replace('whatsapp:', '').trim() || 'N/A',
        "3": propertyName,
        "4": propertyAddress,
        "5": formattedDate,
        "6": formattedTime
      });
    }

    await supabase
      .from('bookings')
      .update({ reminder_12h_sent: true })
      .eq('id', booking.id);

    console.log('12h reminder sent for booking:', booking.id);
  }
}

// ============================================
// 1-HOUR REMINDER
// ============================================
async function send1HourReminders() {
  const now = new Date();
  const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
  const in50Minutes = new Date(now.getTime() + 50 * 60 * 1000);

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      start_datetime,
      agent_name,
      agent_phone,
      leads(name, phone),
      properties(property_name, address)
    `)
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'Scheduled')
    .eq('reminder_1h_sent', false)
    .gt('start_datetime', in50Minutes.toISOString())
    .lt('start_datetime', in1Hour.toISOString());

  if (error) {
    console.error('1h reminder query error:', error.message);
    return;
  }

  console.log(`1h reminders to send: ${bookings?.length || 0}`);

  for (const booking of bookings || []) {
    const leadName = booking.leads?.name || 'there';
    const leadPhone = booking.leads?.phone;
    const propertyName = booking.properties?.property_name || 'the property';
    const propertyAddress = booking.properties?.address || '';
    const agentName = booking.agent_name || 'your agent';
    const agentPhone = booking.agent_phone;

    const startDate = new Date(booking.start_datetime);

    const formattedDate = startDate.toLocaleDateString('en-KE', {
      timeZone: 'Africa/Nairobi',
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });

    const formattedTime = startDate.toLocaleTimeString('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Send to client via approved template
    if (leadPhone) {
      try {
        await twilioClient.messages.create({
          from: SYDIA_WHATSAPP,
          to: leadPhone,
          contentSid: TEMPLATES.USER_REMINDER,
          contentVariables: JSON.stringify({
            "1": leadName,
            "2": propertyName,
            "3": formattedDate,
            "4": formattedTime,
            "5": propertyAddress
          })
        });
        console.log('1h reminder sent to client via template:', leadPhone);
      } catch (err) {
        console.error('Failed to send 1h reminder to client:', err.message);
      }
    }

    // Send to agent via template 
   
    if (agentPhone) {
      await sendTemplateToAgent(agentPhone, TEMPLATES.VIEWING_REMINDER, {
        "1": leadName,
        "2": leadPhone?.replace('whatsapp:', '').trim() || 'N/A',
        "3": propertyName,
        "4": propertyAddress,
        "5": formattedDate,
        "6": formattedTime
      });
    }

    await supabase
      .from('bookings')
      .update({ reminder_1h_sent: true })
      .eq('id', booking.id);

    console.log('1h reminder sent for booking:', booking.id);
  }
}

async function markCompletedBookings() {
  const now = new Date();

  const { data: pastBookings, error } = await supabase
    .from('bookings')
    .select('id, lead_id')
    .eq('tenant_id', TENANT_ID)
    .eq('status', 'Scheduled')
    .lt('end_datetime', now.toISOString());

  if (error) {
    console.error('markCompleted error:', error.message);
    return;
  }

  if (!pastBookings || pastBookings.length === 0) {
    console.log('No bookings to mark completed');
    return;
  }

  const ids = pastBookings.map(b => b.id);
  const leadIds = [...new Set(pastBookings.map(b => b.lead_id))];

  // Mark bookings as Completed
  await supabase
    .from('bookings')
    .update({ status: 'Completed' })
    .in('id', ids);

  // Update lead status from Booked to Contacted
  // Only update leads that are still showing Booked
  // Do not overwrite Hot Lead, Deal Closed, or other meaningful statuses
  for (const leadId of leadIds) {
    const { data: lead } = await supabase
      .from('leads')
      .select('status')
      .eq('id', leadId)
      .single();

    if (lead?.status === 'Booked') {
      await supabase
        .from('leads')
        .update({ status: 'Contacted' })
        .eq('id', leadId);
    }
  }

  console.log(`Marked ${ids.length} bookings as Completed, updated ${leadIds.length} lead statuses`);
}

// ============================================
// SMART FOLLOWUP
// Only sends if lead status is still Booked
// meaning agent has not updated the outcome
// ============================================
async function sendFollowups() {
  const now = new Date();

  // Check viewings that ended 2 to 4 hours ago
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      end_datetime,
      lead_id,
      leads(name, phone, status),
      properties(property_name)
    `)
    .eq('tenant_id', TENANT_ID)
    .in('status', ['Scheduled', 'Completed'])
    .eq('followup_sent', false)
    .gt('end_datetime', fourHoursAgo.toISOString())
    .lt('end_datetime', twoHoursAgo.toISOString());

  if (error) {
    console.error('Followup query error:', error.message);
    return;
  }

  console.log(`Followups to send: ${bookings?.length || 0}`);

  for (const booking of bookings || []) {
    const leadName = booking.leads?.name || 'there';
    const leadPhone = booking.leads?.phone;
    const leadStatus = booking.leads?.status;
    const propertyName = booking.properties?.property_name || 'the property';

    // SMART CHECK: Only send followup if lead is still in a neutral status
    // If agent already updated to Hot Lead, Deal Closed, Not Interested etc — skip
    const skipStatuses = ['Hot Lead', 'Deal Closed', 'Not Interested', 'Offer Made', 'Cancelled'];
    if (skipStatuses.includes(leadStatus)) {
      console.log(`Skipping followup for ${leadName} — status is already: ${leadStatus}`);

      // Still mark as sent so we do not keep checking
      await supabase
        .from('bookings')
        .update({ followup_sent: true })
        .eq('id', booking.id);

      continue;
    }

    // Send natural conversational followup
    if (leadPhone) {
      try {
        await twilioClient.messages.create({
          from: SYDIA_WHATSAPP,
          to: leadPhone,
          contentSid: TEMPLATES.USER_FOLLOWUP,
          contentVariables: JSON.stringify({
            "1": leadName,
            "2": propertyName
          })
        });
        console.log('Followup sent to client via template:', leadPhone);
      } catch (err) {
        console.error('Failed to send followup to client:', err.message);
      }

      // Update lead to awaiting followup so Nina knows context
      await supabase
        .from('leads')
        .update({ awaiting_followup_response: true })
        .eq('id', booking.lead_id);
    }

    // Mark as sent
    await supabase
      .from('bookings')
      .update({ followup_sent: true })
      .eq('id', booking.id);

    console.log('Followup sent for booking:', booking.id);
  }
}



// ============================================
// RUN ALL NOTIFICATIONS
// ============================================
async function runNotifications() {
  console.log('Running notifications at:', new Date().toISOString());

  try { await send12HourReminders(); } catch (e) { console.error('12h error:', e.message); }
  try { await send1HourReminders(); } catch (e) { console.error('1h error:', e.message); }
  try { await sendFollowups(); } catch (e) { console.error('followup error:', e.message); }
  try { await markCompletedBookings(); } catch (e) { console.error('markCompleted error:', e.message); }

  console.log('Notifications complete');
}
module.exports = { runNotifications };