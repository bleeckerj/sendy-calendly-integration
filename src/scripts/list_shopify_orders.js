#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const csvWriter = require('csv-writer').createObjectCsvWriter;
const shopify = require('../clients/shopifyClient');
const logger = require('../utils/logger');

async function run() {
  const args = process.argv.slice(2);
  const opts = {};
  
  for (const a of args) {
    if (a.startsWith('--since=')) opts.since = a.split('=')[1];
    if (a.startsWith('--until=')) opts.until = a.split('=')[1];
    if (a.startsWith('--from=')) opts.since = a.split('=')[1];
    if (a.startsWith('--to=')) opts.until = a.split('=')[1];
    if (a.startsWith('--output=')) opts.output = a.split('=')[1];
    if (a.startsWith('--format=')) opts.format = a.split('=')[1];
    if (a.startsWith('--order-status=')) opts.orderStatus = a.split('=')[1];
  }

  opts.format = opts.format || 'json';
  opts.orderStatus = opts.orderStatus || 'any';

  logger.info('Fetching orders from Shopify...');
  const orders = await shopify.listOrders({ 
    since: opts.since, 
    until: opts.until, 
    status: opts.orderStatus 
  });

  // Extract and dedupe customer emails
  const customers = shopify.extractEmailsFromOrders(orders);
  logger.info(`Found ${customers.length} unique customers from ${orders.length} orders`);

  if (opts.format === 'csv' || (opts.output && opts.output.endsWith('.csv'))) {
    const out = opts.output || path.join(process.cwd(), 'shopify_customers.csv');
    const writer = csvWriter({ 
      path: out, 
      header: [
        { id: 'email', title: 'email' },
        { id: 'name', title: 'name' },
        { id: 'created_at', title: 'created_at' },
        { id: 'order_id', title: 'order_id' },
        { id: 'order_number', title: 'order_number' },
        { id: 'order_value', title: 'order_value' }
      ] 
    });
    await writer.writeRecords(customers);
    logger.info(`Wrote ${customers.length} customers to ${out}`);
  } else {
    const out = opts.output || null;
    const payload = {
      summary: {
        total_orders: orders.length,
        unique_customers: customers.length,
        date_range: {
          since: opts.since || null,
          until: opts.until || null
        },
        order_status: opts.orderStatus
      },
      customers
    };
    
    if (out) {
      fs.writeFileSync(out, JSON.stringify(payload, null, 2));
      logger.info(`Wrote ${customers.length} customers to ${out}`);
    } else {
      console.log(JSON.stringify(payload, null, 2));
    }
  }
}

run().catch((err) => {
  logger.error('Error in list_shopify_orders:', err.message);
  process.exit(1);
});