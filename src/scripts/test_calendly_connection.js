#!/usr/bin/env node
require('dotenv').config();
const calendly = require('../clients/calendlyClient');
const logger = require('../utils/logger');

(async () => {
  const token = process.env.CALENDLY_PERSONAL_ACCESS_TOKEN || process.env.CALENDLY_PAT || null;
  if (!token) {
    console.error('Calendly token not set. Please set CALENDLY_PERSONAL_ACCESS_TOKEN (or CALENDLY_PAT) in .env');
    process.exit(1);
  }

  try {
    // 1) Connectivity and identity
    const user = await calendly.getCurrentUser();
    console.log('Calendly connection OK');
    console.log(JSON.stringify({
      user_uri: user.uri,
      name: user.name,
      slug: user.slug,
      current_organization: user.current_organization
    }, null, 2));

    // 2) Upcoming appointment(s)
    const nowIso = new Date().toISOString();
    const upcoming = await calendly.listScheduledEvents({ since: nowIso, count: 50 });
    const upcomingSorted = upcoming
      .map(e => ({
        name: e.name || e.event_type || 'Scheduled Event',
        start_time: e.start_time,
        end_time: e.end_time,
        uri: e.uri
      }))
      .filter(e => e.start_time)
      .sort((a,b) => new Date(a.start_time) - new Date(b.start_time));

    const nextOne = upcomingSorted[0];
    console.log('\nNext upcoming appointment:');
    if (nextOne) {
      console.log(JSON.stringify(nextOne, null, 2));
    } else {
      console.log('None found');
    }

    // 3) Total appointments over all time
    const allEvents = await calendly.listScheduledEvents({});
    console.log(`\nTotal appointments (all time): ${allEvents.length}`);

    // 4) Unique people (invitees) over all time
    let uniqueEmails = new Set();
    for (const ev of allEvents) {
      const uuid = ev.uri ? ev.uri.split('/').pop() : ev.uuid || ev.id;
      const invs = await calendly.listInviteesForEvent(uuid);
      for (const i of invs) {
        if (i.email) uniqueEmails.add(i.email.toLowerCase());
      }
    }
    console.log(`Unique invitees (all time): ${uniqueEmails.size}`);

  } catch (err) {
    if (err.response) {
      console.error(`Calendly API error ${err.response.status}:`, err.response.data);
    } else {
      console.error('Calendly API error:', err.message);
    }
    process.exit(2);
  }
})();
