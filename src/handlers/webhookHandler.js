const crypto = require('crypto');
const sendyService = require('../services/sendyService');
const cache = require('../utils/cache');
const logger = require('../utils/logger');

/**
 * Verify Calendly webhook signature
 */
function verifyWebhookSignature(payload, signature) {
  const webhookSecret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.warn('No webhook secret configured - skipping signature verification');
    return true;
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Handle Calendly webhook events
 */
async function handleCalendlyWebhook(req, res) {
  try {
    const signature = req.headers['calendly-webhook-signature'];
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    if (signature && !verifyWebhookSignature(payload, signature)) {
      logger.warn('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, payload: eventPayload } = req.body;

    logger.info(`Received Calendly webhook: ${event}`);

    // Only process invitee.created events (when someone books an appointment)
    if (event === 'invitee.created') {
      await processNewInvitee(eventPayload);
    } else {
      logger.info(`Ignoring event type: ${event}`);
    }

    res.status(200).json({ status: 'received' });
  } catch (error) {
    logger.error('Error processing Calendly webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Process new invitee (appointment booking)
 */
async function processNewInvitee(payload) {
  try {
    const invitee = payload;
    const email = invitee.email;
    const name = invitee.name;

    if (!email) {
      logger.warn('No email found in invitee data');
      return;
    }

    // Check cache to prevent duplicate processing
    const cacheKey = `processed:${email}:${invitee.created_at}`;
    if (cache.has(cacheKey)) {
      logger.info(`Already processed invitee: ${email}`);
      return;
    }

    logger.info(`Processing new invitee: ${name} (${email})`);

    // Add to Sendy
    const result = await sendyService.addSubscriber({
      email,
      name,
      listId: process.env.SENDY_LIST_ID
    });

    if (result.success) {
      // Cache successful processing
      cache.set(cacheKey, true);
      logger.info(`Successfully added ${email} to Sendy list`);
    } else {
      logger.error(`Failed to add ${email} to Sendy:`, result.message);
    }
  } catch (error) {
    logger.error('Error processing new invitee:', error);
  }
}

module.exports = {
  handleCalendlyWebhook,
  verifyWebhookSignature,
  processNewInvitee
};