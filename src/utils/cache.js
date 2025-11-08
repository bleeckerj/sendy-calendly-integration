const NodeCache = require('node-cache');

// Create cache instance
const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL) || 3600, // Default 1 hour
  checkperiod: 600, // Check for expired keys every 10 minutes
  useClones: false
});

// Log cache stats periodically (unref so CLI scripts can exit)
const statsInterval = setInterval(() => {
  const stats = cache.getStats();
  if (stats.keys > 0) {
    console.log(`Cache stats: ${stats.keys} keys, ${stats.hits} hits, ${stats.misses} misses`);
  }
}, 300000); // Every 5 minutes
if (typeof statsInterval.unref === 'function') {
  statsInterval.unref();
}

// Helper to fully close cache timers (NodeCache + stats interval) in one-off scripts
cache.shutdown = () => {
  try { cache.close(); } catch (_) {}
  try { clearInterval(statsInterval); } catch (_) {}
};

module.exports = cache;