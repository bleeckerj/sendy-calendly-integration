const axios = require('axios');
const logger = require('../utils/logger');

class SendyClient {
  constructor() {
    this.baseURL = process.env.SENDY_INSTALLATION_URL;
    this.apiKey = process.env.SENDY_API_KEY;

    if (!this.baseURL || !this.apiKey) {
      logger.warn('Sendy configuration missing (SENDY_INSTALLATION_URL or SENDY_API_KEY).');
    }

    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    // Optional HTTPS fallback client if baseURL is http
    if (this.baseURL && this.baseURL.startsWith('http://')) {
      this.httpsHttp = axios.create({
        baseURL: this.baseURL.replace(/^http:\/\//, 'https://'),
        timeout: 15000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json, text/plain, */*'
        }
      });
    }
  }

  // Attempt to list lists - many Sendy installs may not expose a lists API; this is best-effort
  async listLists() {
    // Per Sendy docs: URL /api/lists/get-lists.php requires api_key + brand_id (+ optional include_hidden)
    const brandId = process.env.SENDY_BRAND_ID;
    if (!brandId) {
      return { success: false, message: 'SENDY_BRAND_ID not set. Find it on Brands page (column ID) and add to .env.' };
    }
    try {
      const url = `/api/lists/get-lists.php`;
      const body = { api_key: this.apiKey, brand_id: brandId, include_hidden: 'no' };
      // First attempt: form encoded string
      let res = await this.http.post(url, new URLSearchParams(body).toString());
      let text = String(res.data).trim();
      if (text === 'No data passed') {
        // Retry with formdata object
        res = await this.http.post(url, new URLSearchParams(body));
        text = String(res.data).trim();
      }
      if (text === 'No data passed') {
        // Fallback to GET with query params (some environments mis-handle POST bodies)
        res = await this.http.get(url, { params: body });
        text = String(res.data).trim();
      }
      if (text === 'No data passed' && this.httpsHttp) {
        // Final retry forcing HTTPS base URL
        res = await this.httpsHttp.post(url, new URLSearchParams(body).toString());
        text = String(res.data).trim();
      }
      const status = res.status;
      const data = res.data;
      if (data && typeof data === 'object') {
        return { success: true, lists: data, raw: data, status };
      }
      // Try JSON parse if data is string
      if (typeof data === 'string') {
        const trimmed = data.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(trimmed);
            return { success: true, lists: parsed, raw: data, status };
          } catch (_e) {
            // fallthrough
          }
        }
        // HTML response indicates wrong path or not enabled
        if (/<!DOCTYPE html>|<html[\s>]/i.test(trimmed)) {
          return { success: false, message: 'HTML response received (possible 404 or endpoint not available)', raw: data, status };
        }
        // Some Sendy installs may return plain text like "false" or error messages
        return { success: false, message: 'Unexpected lists response format', raw: data, status };
      }
      return { success: false, message: 'Empty response from Sendy lists endpoint', raw: data, status };
    } catch (err) {
      logger.warn('Could not list Sendy lists (check path /api/lists/get-lists.php & version >= required):', err.message);
      return { success: false, message: err.message };
    }
  }

  async listBrands() {
    try {
      const url = `/api/brands/get-brands.php`;
      const body = { api_key: this.apiKey };
      let res = await this.http.post(url, new URLSearchParams(body).toString());
      let text = String(res.data).trim();
      if (text === 'No data passed') {
        res = await this.http.post(url, new URLSearchParams(body));
        text = String(res.data).trim();
      }
      if (text === 'No data passed') {
        res = await this.http.get(url, { params: body });
        text = String(res.data).trim();
      }
      if (text === 'No data passed' && this.httpsHttp) {
        res = await this.httpsHttp.post(url, new URLSearchParams(body).toString());
        text = String(res.data).trim();
      }
      const raw = res.data;
      if (raw && typeof raw === 'object') return { success: true, brands: raw };
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try { return { success: true, brands: JSON.parse(trimmed), raw }; } catch (_) {}
        }
        if (/<!DOCTYPE html>|<html[\s>]/i.test(trimmed)) return { success: false, message: 'HTML response received for brands endpoint', raw };
        return { success: false, message: 'Unexpected brands response format', raw };
      }
      return { success: false, message: 'Empty brands response', raw };
    } catch (err) {
      logger.warn('Error listing brands:', err.message);
      return { success: false, message: err.message };
    }
  }

  // Get total active subscriber count across a list (wrapper for existing endpoint)
  async getActiveSubscriberCount(listId) {
    try {
      const url = `/api/subscribers/active-subscriber-count.php`;
      const body = { api_key: this.apiKey, list_id: listId };
      let res = await this.http.post(url, new URLSearchParams(body).toString());
      let text = String(res.data).trim();
      if (text === 'No data passed') {
        res = await this.http.post(url, new URLSearchParams(body));
        text = String(res.data).trim();
      }
      if (text === 'No data passed') {
        res = await this.http.get(url, { params: body });
        text = String(res.data).trim();
      }
      if (text === 'No data passed' && this.httpsHttp) {
        res = await this.httpsHttp.post(url, new URLSearchParams(body).toString());
        text = String(res.data).trim();
      }
      const count = parseInt(res.data, 10);
      return { success: true, count: isNaN(count) ? 0 : count, raw: res.data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  // Placeholder for campaign analytics (requires Sendy extended API or direct DB access)
  async getLatestCampaignMetrics() {
    // Without official campaign metrics API, return a placeholder
    return { success: false, message: 'Campaign metrics endpoint not implemented. Requires Sendy API extension.' };
  }

  async getSubscriberStatus(email, listId) {
    try {
      const url = `/api/subscribers/subscription-status.php`;
      const body = { api_key: this.apiKey, email, list_id: listId };
      let res = await this.http.post(url, new URLSearchParams(body).toString());
      let raw = String(res.data).trim();
      if (raw === 'No data passed') {
        res = await this.http.post(url, new URLSearchParams(body));
        raw = String(res.data).trim();
      }
      if (raw === 'No data passed') {
        res = await this.http.get(url, { params: body });
        raw = String(res.data).trim();
      }
      if (raw === 'No data passed' && this.httpsHttp) {
        res = await this.httpsHttp.post(url, new URLSearchParams(body).toString());
        raw = String(res.data).trim();
      }
      const status = raw.toLowerCase();
      const normalized =
        status === 'subscribed' ? 'subscribed' :
        status === 'unsubscribed' ? 'unsubscribed' :
        status === 'unconfirmed' ? 'unconfirmed' :
        status === 'bounced' ? 'bounced' :
        status === 'complained' ? 'complained' :
        status === 'deleted' ? 'deleted' :
        status === 'not in list' ? 'not-in-list' : status;
      return { success: true, status: raw, normalized, isSubscribed: normalized === 'subscribed' };
    } catch (err) {
      logger.warn('Error checking subscriber status:', err.message);
      return { success: false, message: err.message };
    }
  }

  // Subscribe single email (returns normalized response)
  async subscribe({ email, name = '', listId }) {
    try {
      const url = `/subscribe`;
      const body = { api_key: this.apiKey, email, name, list: listId, boolean: 'true' };
      let res = await this.http.post(url, new URLSearchParams(body).toString());
      let data = res.data;
      let text = (data === undefined || data === null) ? '' : String(data).trim();
      const statusCode = res.status;

      const attemptFallback = async (reason) => {
        // try alternative encodings / https
        if (reason === 'no-data-passed') {
          res = await this.http.post(url, new URLSearchParams(body));
          text = String(res.data || '').trim();
          if (text === 'No data passed' && this.httpsHttp) {
            res = await this.httpsHttp.post(url, new URLSearchParams(body).toString());
            text = String(res.data || '').trim();
          }
        } else if (reason === 'empty') {
          if (this.httpsHttp) {
            res = await this.httpsHttp.post(url, new URLSearchParams(body).toString());
            text = String(res.data || '').trim();
          } else {
            // retry with alternative form
            res = await this.http.post(url, new URLSearchParams(body));
            text = String(res.data || '').trim();
          }
        }
      };

      if (text === 'No data passed') {
        await attemptFallback('no-data-passed');
      } else if (text.length === 0) {
        await attemptFallback('empty');
      }

  const lower = text.toLowerCase();
  // Sendy returns plain '1' for success when boolean=true is not respected or older versions; treat '1' as success if no error keywords.
  const successIndicators = ['true', 'already subscribed', 'already subscribed.', '1'];
  const errorIndicators = ['invalid email', 'some fields are missing', 'invalid api key', 'invalid list id', 'bounced', 'complained'];
  const hasError = errorIndicators.some(e => lower.includes(e));
  const isSuccess = !hasError && (text === true || successIndicators.some(si => lower === si || lower.includes(si)));
  return { success: !!isSuccess, message: text, statusCode };
    } catch (err) {
      logger.error('Sendy subscribe error:', err.message);
      return { success: false, message: err.message };
    }
  }

  // Bulk subscribe (simple sequential implementation with optional dry-run)
  async bulkSubscribe(list, items = [], { dryRun = false, batchSize = 20, throttleMs = 250 } = {}) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      for (const it of batch) {
        if (dryRun) {
          results.push({ email: it.email, success: false, dryRun: true, message: 'dry-run' });
          continue;
        }

        const res = await this.subscribe({ email: it.email, name: it.name || '', listId: list });
        results.push({ email: it.email, success: res.success, message: res.message, statusCode: res.statusCode });
        await new Promise((r) => setTimeout(r, throttleMs));
      }
    }
    return results;
  }
}

module.exports = new SendyClient();
