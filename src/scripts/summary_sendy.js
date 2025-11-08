#!/usr/bin/env node
require('dotenv').config();
const sendy = require('../clients/sendyClient');
const logger = require('../utils/logger');

async function run() {
  const args = process.argv.slice(2);
  let listId = process.env.SENDY_LIST_ID || null;
  for (const a of args) {
    if (a.startsWith('--list-id=')) listId = a.split('=')[1];
  }

  if (!listId) {
    logger.warn('No list id provided; pass --list-id or set SENDY_LIST_ID in .env');
  }

  const summary = { list: { id: listId }, lists_overview: null, latest_campaign: null };

  if (listId) {
    const count = await sendy.getActiveSubscriberCount(listId);
    summary.list.active_subscribers = count.success ? count.count : null;
    if (!count.success) summary.list.error = count.message || count.raw;
  }

  const lists = await sendy.listLists();
  if (lists.success) {
    const ids = Object.keys(lists.lists || {});
    summary.lists_overview = { total: ids.length, sample: ids.slice(0, 5).map(id => ({ id, ...(lists.lists[id] || {}) })) };
  } else {
    summary.lists_overview = { success: false, message: lists.message || 'List endpoint not available' };
  }

  const campaign = await sendy.getLatestCampaignMetrics();
  summary.latest_campaign = campaign;

  console.log(JSON.stringify(summary, null, 2));
}

run().catch(err => {
  logger.error('Sendy summary error:', err.message);
  process.exit(1);
});
