#!/usr/bin/env node
require('dotenv').config();
const sendy = require('../clients/sendyClient');
const logger = require('../utils/logger');

async function run() {
  const args = process.argv.slice(2);
  const opts = { email: null, name: '', listId: process.env.SENDY_LIST_ID };
  for (const a of args) {
    if (a.startsWith('--email=')) opts.email = a.split('=')[1];
    if (a.startsWith('--name=')) opts.name = a.split('=')[1];
    if (a.startsWith('--list-id=')) opts.listId = a.split('=')[1];
  }

  if (!opts.listId) {
    logger.error('No Sendy list id provided. Use --list-id or set SENDY_LIST_ID in env.');
    process.exit(1);
  }

  // Default to an intentionally invalid email to avoid subscribing real addresses while testing response
  if (!opts.email) {
    opts.email = 'invalid-email-format';
    logger.info('No --email supplied. Using invalid test email to get a deterministic error string.');
  }

  logger.info(`Testing Sendy subscribe: email='${opts.email}', name='${opts.name}', list='${opts.listId}'`);
  const res = await sendy.subscribe({ email: opts.email, name: opts.name, listId: opts.listId });
  const output = {
    success: res.success,
    statusCode: res.statusCode || null,
    message: res.message
  };
  console.log(JSON.stringify(output, null, 2));
}

run().catch((err) => {
  logger.error('Error testing Sendy subscribe:', err.message);
  process.exit(1);
});
