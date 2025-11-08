#!/usr/bin/env node
require('dotenv').config();
const calendly = require('../clients/calendlyClient');
const logger = require('../utils/logger');

function normalizeDate(val, kind) {
  if (!val) return val;
  if (val.includes('T')) return val;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return kind === 'until' ? `${val}T23:59:59Z` : `${val}T00:00:00Z`;
  }
  return val;
}

async function run() {
  const args = process.argv.slice(2);
  let since = null;
  let until = null;
  let limit = 10;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--since=')) since = a.split('=')[1];
    if (a.startsWith('--until=')) until = a.split('=')[1];
    if (a.startsWith('--from=')) since = normalizeDate(a.split('=')[1], 'since');
    if (a.startsWith('--to=')) until = normalizeDate(a.split('=')[1], 'until');
    if (a === '--from' && args[i+1]) { since = normalizeDate(args[i+1], 'since'); i++; continue; }
    if (a === '--to' && args[i+1]) { until = normalizeDate(args[i+1], 'until'); i++; continue; }
    if (a.startsWith('--limit=')) limit = parseInt(a.split('=')[1]) || limit;
    if (a === '--limit' && args[i+1]) { limit = parseInt(args[i+1]) || limit; i++; continue; }
  }

  if (!since && !until) {
    logger.warn('No date window provided. This will fetch all scheduled events for the user (may be large).');
  } else {
    logger.info(`Date window: since=${since || 'unset'} until=${until || 'unset'}`);
  }

  try {
    // Only call Calendly events API
    const events = await calendly.listScheduledEvents({ since, until, count: 100 });
    logger.info(`Calendly returned ${events.length} events (pre-filtering in client).`);

    // Show first N events
    const show = Math.min(limit, events.length);
    for (let i = 0; i < show; i++) {
      const ev = events[i];
      const start = ev.start_time || ev.start || ev.event_start_time || ev.start_time || ev.start_time;
      const name = ev.name || ev.event_type || ev.title || ev.name;
      const uri = ev.uri || ev.resource || ev.id || ev.uuid;
      logger.info(`Event[${i}] name=${name} start=${start} uri=${uri}`);
    }

    // Defensive: also apply a local date filter to prove which events are inside the window
    if (since || until) {
      const min = since ? new Date(since).getTime() : null;
      const max = until ? new Date(until).getTime() : null;
      const inWindow = events.filter(ev => {
        const start = new Date(ev.start_time || ev.start || ev.created_at || 0).getTime();
        if (min && start < min) return false;
        if (max && start > max) return false;
        return true;
      });
      logger.info(`After local date filter: ${inWindow.length} events fall within the requested window.`);
    }

    // Fetch invitees for first few events to confirm invitee calls also work
    const inviteeFetchCount = Math.min(3, events.length);
    for (let i = 0; i < inviteeFetchCount; i++) {
      const ev = events[i];
      const uuid = ev.uri ? ev.uri.split('/').pop() : ev.uuid || ev.id;
      logger.info(`Fetching invitees for event ${uuid} (${i+1}/${inviteeFetchCount})...`);
      const invitees = await calendly.listInviteesForEvent(uuid, { count: 100 });
      logger.info(`Event ${uuid} returned ${invitees.length} invitees (sample 5):`);
      invitees.slice(0,5).forEach((inv, idx) => {
        logger.info(`  Invitee[${idx}] name=${inv.name || inv.full_name || ''} email=${inv.email || inv.email_address || ''} created_at=${inv.created_at || inv.created || ''}`);
      });
    }

    logger.info('Calendly atomic test complete.');
  } catch (err) {
    logger.error('Calendly atomic test failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

run();
