const NodeCache = require('node-cache');

// Create cache instance
const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL) || 3600, // Default 1 hour
  checkperiod: 600, // Check for expired keys every 10 minutes
  useClones: false
});

// Log cache stats periodically
setInterval(() => {
  const stats = cache.getStats();
  if (stats.keys > 0) {
    console.log(`Cache stats: ${stats.keys} keys, ${stats.hits} hits, ${stats.misses} misses`);
  }
}, 300000); // Every 5 minutes

module.exports = cache;