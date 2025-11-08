#!/usr/bin/env node
require('dotenv').config();
const http = require('http');

// This script sends a mock Calendly webhook POST to a locally running server (src/server.js)
// Usage: node src/scripts/test_webhook_local.js --port=3000

let port = process.env.PORT || 3000;
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--port=')) port = parseInt(a.split('=')[1], 10);
}

const payload = {
  event: 'invitee.created',
  payload: {
    email: 'test@example.com',
    name: 'Test User',
    created_at: new Date().toISOString(),
    timezone: 'UTC'
  }
};

const data = JSON.stringify(payload);

const req = http.request({
  hostname: 'localhost',
  port,
  path: '/webhook/calendly',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(`Webhook test response status: ${res.statusCode}`);
    console.log('Body:', body);
  });
});

req.on('error', (err) => {
  console.error('Error sending webhook test:', err.message);
  process.exit(1);
});

req.write(data);
req.end();
