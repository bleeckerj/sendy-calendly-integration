#!/usr/bin/env node
require('dotenv').config();
const sendy = require('../clients/sendyClient');
const logger = require('../utils/logger');

async function run() {
  const res = await sendy.listBrands();
  if (!res.success) {
    logger.warn('Could not retrieve brands from Sendy via API. Message:', res.message);
    if (res.raw) logger.debug('Raw response:', typeof res.raw === 'string' ? res.raw.slice(0, 500) : JSON.stringify(res.raw).slice(0, 500));
    process.exit(1);
  }
  console.log(JSON.stringify(res.brands, null, 2));
}

run().catch((err) => {
  logger.error('Error listing Sendy brands:', err.message);
  process.exit(1);
});
