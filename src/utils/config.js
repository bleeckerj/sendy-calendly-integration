const logger = require('./logger');

/**
 * Validate required environment variables
 */
function validateConfig() {
  const required = [
    'SENDY_API_KEY',
    'SENDY_INSTALLATION_URL',
    'SENDY_LIST_ID'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error('Missing required environment variables:', missing.join(', '));
    logger.error('Please copy .env.example to .env and fill in the required values');
    return false;
  }

  // Validate Sendy URL format
  const sendyUrl = process.env.SENDY_INSTALLATION_URL;
  if (!sendyUrl.startsWith('http://') && !sendyUrl.startsWith('https://')) {
    logger.error('SENDY_INSTALLATION_URL must start with http:// or https://');
    return false;
  }

  // Remove trailing slash from Sendy URL
  if (sendyUrl.endsWith('/')) {
    process.env.SENDY_INSTALLATION_URL = sendyUrl.slice(0, -1);
  }

  return true;
}

/**
 * Get configuration summary
 */
function getConfigSummary() {
  return {
    port: process.env.PORT || 3000,
    environment: process.env.NODE_ENV || 'development',
    sendyUrl: process.env.SENDY_INSTALLATION_URL,
    listId: process.env.SENDY_LIST_ID,
    cacheEnabled: true,
    cacheTTL: process.env.CACHE_TTL || 3600,
    webhookSecretConfigured: !!process.env.CALENDLY_WEBHOOK_SECRET
  };
}

module.exports = {
  validateConfig,
  getConfigSummary
};