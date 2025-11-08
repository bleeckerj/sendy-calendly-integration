#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');

(async () => {
  const baseURL = process.env.SENDY_INSTALLATION_URL;
  const apiKey = process.env.SENDY_API_KEY;
  let listId = process.env.SENDY_LIST_ID;

  // allow override via CLI
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--list-id=')) listId = a.split('=')[1];
  }

  if (!baseURL || !apiKey) {
    console.error('SENDY_INSTALLATION_URL or SENDY_API_KEY not set in .env');
    process.exit(1);
  }
  if (!listId) {
    console.error('Provide a list id via SENDY_LIST_ID in .env or --list-id=...');
    process.exit(1);
  }

  const http = axios.create({
    baseURL,
    timeout: 15000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  try {
    // Read-only check: active subscriber count for the list
    const url = '/api/subscribers/active-subscriber-count.php';
    const params = new URLSearchParams({ api_key: apiKey, list_id: listId });
    const res = await http.post(url, params.toString());
    const count = parseInt(res.data, 10);
    if (isNaN(count)) {
      console.log('Sendy connection OK (response not numeric, raw shown below):');
      console.log(res.data);
    } else {
      console.log('Sendy connection OK');
      console.log(JSON.stringify({ list_id: listId, active_subscribers: count }, null, 2));
    }
  } catch (err) {
    if (err.response) {
      console.error(`Sendy API error ${err.response.status}:`, err.response.data);
    } else {
      console.error('Sendy API error:', err.message);
    }
    process.exit(2);
  }
})();
