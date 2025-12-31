#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const shopify = require('../clients/shopifyClient');
const sendy = require('../clients/sendyClient');
const cache = require('../utils/cache');
const FileCache = require('../utils/fileCache');
const logger = require('../utils/logger');

async function run() {
  const args = process.argv.slice(2);
  const opts = { 
    dryRun: false, 
    batchSize: 20, 
    throttleMs: 250, 
    noCache: false, 
    clearCache: false, 
    noPersistentCache: false, 
    cacheFile: null, 
    refreshPersistent: false,
    orderStatus: 'any',
    source: 'orders'
  };

  const normalizeDate = (val, kind) => {
    if (!val) return val;
    // If value already looks like ISO with time, use as-is
    if (val.includes('T')) return val;
    // Accept YYYY-MM-DD and append Zulu time range
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return kind === 'until' ? `${val}T23:59:59Z` : `${val}T00:00:00Z`;
    }
    return val;
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // Forms with '='
    if (a.startsWith('--since=')) opts.since = a.split('=')[1];
    if (a.startsWith('--until=')) opts.until = a.split('=')[1];
    if (a.startsWith('--from=')) opts.since = normalizeDate(a.split('=')[1], 'since');
    if (a.startsWith('--to=')) opts.until = normalizeDate(a.split('=')[1], 'until');
    if (a.startsWith('--list-id=')) opts.listId = a.split('=')[1];
    if (a.startsWith('--batch-size=')) opts.batchSize = parseInt(a.split('=')[1]);
    if (a.startsWith('--throttle-ms=')) opts.throttleMs = parseInt(a.split('=')[1]);
    if (a.startsWith('--cache-file=')) opts.cacheFile = a.split('=')[1];
    if (a.startsWith('--order-status=')) opts.orderStatus = a.split('=')[1];
    if (a.startsWith('--source=')) opts.source = a.split('=')[1];

    // Space-separated forms: --from 2025-11-01 --to 2025-11-07 etc.
    if (a === '--since' && args[i+1]) { opts.since = args[i+1]; i++; continue; }
    if (a === '--until' && args[i+1]) { opts.until = args[i+1]; i++; continue; }
    if (a === '--from' && args[i+1]) { opts.since = normalizeDate(args[i+1], 'since'); i++; continue; }
    if (a === '--to' && args[i+1]) { opts.until = normalizeDate(args[i+1], 'until'); i++; continue; }
    if (a === '--list-id' && args[i+1]) { opts.listId = args[i+1]; i++; continue; }
    if (a === '--batch-size' && args[i+1]) { opts.batchSize = parseInt(args[i+1]); i++; continue; }
    if (a === '--throttle-ms' && args[i+1]) { opts.throttleMs = parseInt(args[i+1]); i++; continue; }
    if (a === '--cache-file' && args[i+1]) { opts.cacheFile = args[i+1]; i++; continue; }
    if (a === '--order-status' && args[i+1]) { opts.orderStatus = args[i+1]; i++; continue; }
    if (a === '--source' && args[i+1]) { opts.source = args[i+1]; i++; continue; }

    // Flags
    if (a === '--dry-run') opts.dryRun = true;
    if (a === '--no-cache') opts.noCache = true;
    if (a === '--clear-cache') opts.clearCache = true;
    if (a === '--no-persistent-cache') opts.noPersistentCache = true;
    if (a === '--refresh-persistent') opts.refreshPersistent = true;
  }

  if (!opts.listId) {
    opts.listId = process.env.SENDY_SHOPIFY_LIST_ID || process.env.SENDY_LIST_ID;
  }
  if (!opts.listId) {
    logger.error('No Sendy list id provided. Use --list-id or set SENDY_SHOPIFY_LIST_ID / SENDY_LIST_ID in env.');
    process.exit(1);
  }

  // Setup persistent file cache AFTER we know listId
  const persistentFilePath = opts.cacheFile || process.env.SENDY_SYNC_CACHE_FILE || path.join(process.cwd(), `.sendy_shopify_cache_${opts.listId}.json`);
  const fileCache = new FileCache({ filePath: persistentFilePath });
  if (opts.noPersistentCache) {
    logger.info('Persistent file cache disabled (--no-persistent-cache).');
  } else {
    fileCache.load();
    if (opts.refreshPersistent) {
      logger.info('Refreshing persistent cache: clearing existing stored emails (--refresh-persistent).');
      fileCache.clear();
    }
    logger.info(`Using persistent cache file: ${persistentFilePath}`);
  }

  if (opts.clearCache && typeof cache.flushAll === 'function') {
    cache.flushAll();
    logger.info('In-memory cache cleared at start of run (--clear-cache).');
  }

  if (!opts.since && !opts.until) {
    logger.warn('No date window provided (--since/--until or --from/--to). Fetching ALL customers/orders may take a while.');
  } else {
    logger.info(`Date window: since=${opts.since || 'unset'} until=${opts.until || 'unset'}`);
  }

  let customers = [];
  let orders = [];
  const source = String(opts.source || 'orders').toLowerCase();
  if (source === 'customers') {
    logger.info('🛍️  Fetching customers from Shopify...');
    const shopifyCustomers = await shopify.listCustomers({
      since: opts.since,
      until: opts.until,
      limit: 250
    });
    customers = shopifyCustomers
      .map((c) => {
        const email = c.email ? String(c.email).toLowerCase().trim() : null;
        if (!email) return null;
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || email.split('@')[0];
        return { email, name, created_at: c.created_at, raw_customer: c };
      })
      .filter(Boolean);
    logger.info(`✅ Found ${customers.length} customers from Shopify customer list`);
  } else {
    logger.info('📦 Fetching orders from Shopify...');
    orders = await shopify.listOrders({ 
      since: opts.since, 
      until: opts.until, 
      status: opts.orderStatus, 
      limit: 250 
    });
    customers = shopify.extractEmailsFromOrders(orders);
    logger.info(`✅ Found ${customers.length} unique customer emails from ${orders.length} orders`);
  }
  
  if (customers.length) {
    logger.info(`Estimating status check duration ~${Math.ceil(customers.length * 120 / 1000)}s (assuming ~120ms per API call).`);
  }

  const toSubscribe = [];
  const counters = {
    cached: 0,
    alreadySubscribed: 0,
    unsubscribed: 0,
    bouncedOrComplained: 0,
    notInList: 0,
    unknownStatus: 0
  };

  let processed = 0;
  for (const customer of customers) {
    const cacheKey = `synced:${opts.listId}:${customer.email}`;
    const lowerEmail = customer.email.toLowerCase();
    const hasPersistent = !opts.noPersistentCache && fileCache.hasEmail(opts.listId, lowerEmail);
    
    if (!opts.noCache && cache.get(cacheKey)) {
      logger.debug(`Skipping cached email: ${customer.email}`);
      counters.cached++;
      continue;
    }
    if (hasPersistent) {
      logger.debug(`Skipping persistent-cached email: ${customer.email}`);
      counters.alreadySubscribed++;
      continue;
    }

    // Check Sendy status
    const status = await sendy.getSubscriberStatus(customer.email, opts.listId);
    if (status.success) {
      if (status.normalized === 'subscribed') {
        logger.debug(`${customer.email} already subscribed`);
        if (!opts.noCache) cache.set(cacheKey, true);
        if (!opts.noPersistentCache) fileCache.setEmail(opts.listId, lowerEmail);
        counters.alreadySubscribed++;
        continue;
      } else if (status.normalized === 'unsubscribed') {
        logger.info(`${customer.email} previously unsubscribed; respecting status (will not resubscribe).`);
        if (!opts.noCache) cache.set(cacheKey, true);
        counters.unsubscribed++;
        continue;
      } else if (status.normalized === 'bounced' || status.normalized === 'complained') {
        logger.warn(`${customer.email} status is ${status.normalized}; skipping.`);
        if (!opts.noCache) cache.set(cacheKey, true);
        counters.bouncedOrComplained++;
        continue;
      } else if (status.normalized === 'not-in-list') {
        counters.notInList++;
      } else {
        logger.debug(`${customer.email} status ${status.normalized}; will attempt subscribe if not subscribed.`);
        counters.unknownStatus++;
      }
    }

    toSubscribe.push({
      email: customer.email,
      name: customer.name
    });
    
    processed++;
    if (processed % 50 === 0) {
      logger.info(`⏳ Progress: checked ${processed}/${customers.length} customers; pending subscribe queue size ${toSubscribe.length}`);
    }
  }

  logger.info(`🚀 Will attempt subscription for ${toSubscribe.length} emails (dryRun=${opts.dryRun}).`);
  if (opts.dryRun) {
    logger.info('Note: dry-run means results.success=false in the report entries because no API call is made.');
  }

  const results = await sendy.bulkSubscribe(opts.listId, toSubscribe, { 
    dryRun: opts.dryRun, 
    batchSize: opts.batchSize, 
    throttleMs: opts.throttleMs 
  });
  const subscriptionFailures = results.filter(r => !r.success).length;

  // Cache successes
  let successCount = 0;
  for (const res of results) {
    if (res.success) {
      if (!opts.noCache) cache.set(`synced:${opts.listId}:${res.email}`, true);
      if (!opts.noPersistentCache) fileCache.setEmail(opts.listId, res.email.toLowerCase());
      successCount++;
    }
  }

  logger.info(`🎉 Shopify sync complete. ${successCount} subscribed (dryRun=${opts.dryRun}).`);

  // Write report
  const reportPath = path.join(process.cwd(), `shopify_sync_report_${Date.now()}.json`);
  const report = {
    dryRun: opts.dryRun,
    source: source,
    listId: opts.listId,
    since: opts.since || null,
    until: opts.until || null,
    orderStatus: opts.orderStatus,
    persistentCacheFile: opts.noPersistentCache ? null : persistentFilePath,
    totals: {
      orders_fetched: orders.length,
      customers_checked: customers.length,
      attempted: toSubscribe.length,
      subscribed: successCount,
      would_subscribe: toSubscribe.length,
      skipped: {
        cached: counters.cached,
        alreadySubscribed: counters.alreadySubscribed,
        unsubscribed: counters.unsubscribed,
        bouncedOrComplained: counters.bouncedOrComplained,
        notInList: counters.notInList,
        unknownStatus: counters.unknownStatus
      },
      subscriptionFailures
    },
    sample_customers: customers.slice(0, 5).map(c => ({
      email: c.email,
      name: c.name,
      order_id: c.order_id,
      order_value: c.order_value,
      created_at: c.created_at
    })),
    results
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  logger.info(`📝 Report written to ${reportPath}`);
  
  if (!opts.noPersistentCache) {
    fileCache.save();
    logger.info(`💾 Persistent cache updated (${Object.keys(fileCache.ensureList(opts.listId).emails).length} emails stored).`);
  }
}

run()
  .then(() => {
    // Gracefully shutdown cache timers to allow process to exit
    if (typeof cache.shutdown === 'function') cache.shutdown();
    logger.info('✨ Shopify sync completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('Error in Shopify sync script:', err.message);
    if (typeof cache.shutdown === 'function') cache.shutdown();
    process.exit(1);
  });
