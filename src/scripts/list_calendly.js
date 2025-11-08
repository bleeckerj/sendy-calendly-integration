#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csvWriter = require('csv-writer').createObjectCsvWriter;
const calendly = require('../clients/calendlyClient');
const logger = require('../utils/logger');

async function run() {
  const args = process.argv.slice(2);
  const opts = {};
  for (const a of args) {
    if (a.startsWith('--since=')) opts.since = a.split('=')[1];
    if (a.startsWith('--until=')) opts.until = a.split('=')[1];
    if (a.startsWith('--output=')) opts.output = a.split('=')[1];
    if (a.startsWith('--format=')) opts.format = a.split('=')[1];
  }

  opts.format = opts.format || 'json';

  logger.info('Fetching invitees from Calendly...');
  const invitees = await calendly.listInviteesAcrossEvents({ since: opts.since, until: opts.until });

  // Normalize and dedupe by email - keep latest created_at
  const map = new Map();
  for (const inv of invitees) {
    if (!inv.email) continue;
    const email = inv.email.toLowerCase().trim();
    const cur = map.get(email);
    const created = new Date(inv.created_at || Date.now());
    if (!cur || created > new Date(cur.created_at || 0)) {
      map.set(email, { email, name: inv.name || '', created_at: inv.created_at || null, event: inv.event_name || null });
    }
  }

  const rows = Array.from(map.values()).sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

  if (opts.format === 'csv' || (opts.output && opts.output.endsWith('.csv'))) {
    const out = opts.output || path.join(process.cwd(), 'calendly_invitees.csv');
    const writer = csvWriter({ path: out, header: [ {id: 'email', title: 'email'}, {id: 'name', title: 'name'}, {id: 'created_at', title: 'created_at'}, {id: 'event', title: 'event'} ] });
    await writer.writeRecords(rows);
    logger.info(`Wrote ${rows.length} rows to ${out}`);
  } else {
    const out = opts.output || null;
    const payload = rows;
    if (out) {
      fs.writeFileSync(out, JSON.stringify(payload, null, 2));
      logger.info(`Wrote ${rows.length} rows to ${out}`);
    } else {
      console.log(JSON.stringify(payload, null, 2));
    }
  }
}

run().catch((err) => {
  logger.error('Error in list_calendly:', err.message);
  process.exit(1);
});
