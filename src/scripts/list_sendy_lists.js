#!/usr/bin/env node
require('dotenv').config();
const sendy = require('../clients/sendyClient');
const logger = require('../utils/logger');

async function run() {
  const args = process.argv.slice(2);
  const opts = {};
  for (const a of args) {
    if (a.startsWith('--format=')) opts.format = a.split('=')[1];
  }
  opts.format = opts.format || 'json';

  if (!process.env.SENDY_BRAND_ID) {
    logger.warn('SENDY_BRAND_ID is not set. Please add it to your .env (Find it in Sendy under Settings > Brands, column ID).');
    process.exit(1);
  }
  const res = await sendy.listLists();
  if (!res.success) {
    logger.warn('Could not retrieve lists from Sendy via API. Status:', res.status, 'Message:', res.message);
    if (res.raw) {
      logger.debug('Raw response:', typeof res.raw === 'string' ? res.raw.slice(0, 500) : JSON.stringify(res.raw).slice(0, 500));
    }
    process.exit(1);
  }

  if (opts.format === 'json') {
  console.log(JSON.stringify({ status: res.status, lists: res.lists }, null, 2));
  } else {
    // simple table
    for (const id in res.lists) {
      const l = res.lists[id];
      console.log(`${id}\t${l.name || l.title || ''}`);
    }
  }
}

run().catch((err) => {
  logger.error('Error listing Sendy lists:', err.message);
  process.exit(1);
});
