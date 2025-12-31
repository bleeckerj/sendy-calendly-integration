#!/usr/bin/env node
require('dotenv').config();
const shopify = require('../clients/shopifyClient');
const logger = require('../utils/logger');

(async () => {
  const shopName = process.env.SHOPIFY_SHOP_NAME;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  
  console.log('Environment check:');
  console.log('SHOPIFY_SHOP_NAME:', shopName);
  console.log('SHOPIFY_ACCESS_TOKEN:', accessToken ? `${accessToken.substring(0, 10)}...` : 'NOT SET');
  
  if (!shopName || !accessToken) {
    console.error('Shopify credentials not set. Please set SHOPIFY_SHOP_NAME and SHOPIFY_ACCESS_TOKEN in .env');
    process.exit(1);
  }

  try {
    // 1) Connectivity and shop info
    const shop = await shopify.getShopInfo();
    console.log('Shopify connection OK');
    console.log(JSON.stringify({
      shop_name: shop.name,
      domain: shop.domain,
      email: shop.email,
      currency: shop.currency,
      timezone: shop.timezone,
      plan_name: shop.plan_name
    }, null, 2));

    // 2) Recent orders count
    const recentOrders = await shopify.listOrders({ limit: 50 });
    console.log(`\nRecent orders: ${recentOrders.length} found`);

    // 3) Sample recent order with customer email
    if (recentOrders.length > 0) {
      const sampleOrder = recentOrders[0];
      console.log('\nMost recent order sample:');
      console.log(JSON.stringify({
        id: sampleOrder.id,
        order_number: sampleOrder.order_number || sampleOrder.name,
        email: sampleOrder.email,
        customer_email: sampleOrder.customer?.email,
        created_at: sampleOrder.created_at,
        total_price: sampleOrder.total_price,
        currency: sampleOrder.currency
      }, null, 2));
    }

    // 4) Total orders (limited sample)
    const allOrders = await shopify.listOrders({ limit: 250 });
    console.log(`\nTotal orders (sample): ${allOrders.length}`);

    // 5) Extract unique customer emails
    const customers = shopify.extractEmailsFromOrders(allOrders);
    console.log(`Unique customer emails: ${customers.length}`);

    if (customers.length > 0) {
      console.log('\nSample customers:');
      customers.slice(0, 3).forEach((customer, idx) => {
        console.log(`  ${idx + 1}. ${customer.email} (${customer.name}) - Order #${customer.order_number} - ${customer.order_value}`);
      });
    }

  } catch (err) {
    if (err.response) {
      console.error(`Shopify API error ${err.response.status}:`, err.response.data);
    } else {
      console.error('Shopify API error:', err.message);
    }
    process.exit(2);
  }
})();