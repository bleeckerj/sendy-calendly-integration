#!/usr/bin/env node
require('dotenv').config();
const calendly = require('../clients/calendlyClient');
const logger = require('../utils/logger');

function bucketByDay(invitees) {
  const buckets = {};
  for (const i of invitees) {
    if (!i.created_at) continue;
    const day = i.created_at.slice(0, 10); // YYYY-MM-DD
    buckets[day] = (buckets[day] || 0) + 1;
  }
  return buckets;
}

function bucketByHour(invitees) {
  const buckets = {};
  for (const i of invitees) {
    if (!i.created_at) continue;
    const hour = new Date(i.created_at).getUTCHours();
    buckets[hour] = (buckets[hour] || 0) + 1;
  }
  return buckets;
}

function topInvitees(invitees, limit = 10) {
  const counts = {};
  for (const i of invitees) {
    if (!i.email) continue;
    const email = i.email.toLowerCase();
    counts[email] = (counts[email] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([email, count]) => ({ email, count }));
}

async function run() {
  const args = process.argv.slice(2);
  const opts = { limit: 10 };
  for (const a of args) {
    if (a.startsWith('--since=')) opts.since = a.split('=')[1];
    if (a.startsWith('--until=')) opts.until = a.split('=')[1];
    if (a.startsWith('--top=')) opts.limit = parseInt(a.split('=')[1], 10);
  }

  logger.info('Fetching events and invitees for analytics...');
  const invitees = await calendly.listInviteesAcrossEvents({ since: opts.since, until: opts.until });

  const dayBuckets = bucketByDay(invitees);
  const hourBuckets = bucketByHour(invitees);
  const top = topInvitees(invitees, opts.limit);

  const summary = {
    range: { since: opts.since || null, until: opts.until || null },
    total_invitees: invitees.length,
    unique_emails: new Set(invitees.filter(i => i.email).map(i => i.email.toLowerCase())).size,
    per_day: dayBuckets,
    per_hour_utc: hourBuckets,
    top_invitees: top
  };

  console.log(JSON.stringify(summary, null, 2));
}

run().catch(err => {
  logger.error('Analytics error:', err.message);
  process.exit(1);
});
