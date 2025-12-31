const axios = require('axios');
const logger = require('../utils/logger');

class CalendlyClient {
  constructor() {
    // Prefer PAT naming; keep backwards-compatible aliases
    this.token = process.env.CALENDLY_PERSONAL_ACCESS_TOKEN || process.env.CALENDLY_PAT || null;
    this.baseURL = 'https://api.calendly.com';

    if (!this.token) {
      logger.warn('No Calendly Personal Access Token found. Set CALENDLY_PERSONAL_ACCESS_TOKEN (or CALENDLY_PAT).');
    }

    this.http = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: this.token ? `Bearer ${this.token}` : undefined,
        Accept: 'application/json'
      },
      timeout: 20000
    });

    // Debug interceptor to log outgoing requests (method, url, params)
    this.http.interceptors.request.use((config) => {
      try {
        const p = config.params ? JSON.stringify(config.params) : '';
        logger.debug(`Calendly request: ${config.method?.toUpperCase()} ${config.url} ${p}`);
      } catch (_) {}
      return config;
    });

    // Response interceptor to handle rate limiting
    this.http.interceptors.response.use(
      (response) => response,
      (error) => {
        // Just pass through, retry logic will handle it
        return Promise.reject(error);
      }
    );
  }

  async _requestWithRetry(url, config = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.http.get(url, config);
      } catch (err) {
        const status = err.response?.status;
        const isLastAttempt = i === retries - 1;

        if (isLastAttempt) throw err;

        if (status === 429) {
          const retryAfter = parseFloat(err.response.headers['retry-after'] || 1) * 1000;
          logger.warn(`Calendly rate limit hit (429). Retrying after ${retryAfter}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter + 500)); // Add buffer
          continue;
        }

        if (status >= 500 && status < 600) {
          const delay = 1000 * Math.pow(2, i); // 1s, 2s, 4s
          logger.warn(`Calendly server error (${status}). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // For other errors, throw immediately
        throw err;
      }
    }
  }

  async getCurrentUser() {
    try {
      const res = await this.http.get('/users/me');
      return res.data && res.data.resource ? res.data.resource : res.data;
    } catch (err) {
      logger.error('Failed to fetch Calendly current user:', err.message);
      throw err;
    }
  }

  async _get(url, params = {}) {
    try {
      const res = await this.http.get(url, { params });
      return res.data;
    } catch (err) {
      const status = err.response && err.response.status;
      const data = err.response && err.response.data;
      if (status) {
        logger.error(`Calendly API error ${status}`, err.message);
        if (data) {
          try {
            const snippet = typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500);
            logger.debug('Calendly response body:', snippet);
          } catch (_) {}
        }
      } else {
        logger.error('Calendly API error', err.message);
      }
      throw err;
    }
  }

  _getNextPageInfo(data) {
    const pagination = data && data.pagination ? data.pagination : {};
    const nextPage = typeof pagination.next_page === 'string' ? pagination.next_page.trim() : null;
    const nextPageToken = typeof pagination.next_page_token === 'string' ? pagination.next_page_token.trim() : null;
    return {
      nextPage: nextPage || null,
      nextPageToken: nextPageToken || null
    };
  }

  // List scheduled events in a date range; returns array of events
  async listScheduledEvents({ user = null, organization = null, since = null, until = null, count = 100 } = {}) {
    // Calendly requires one of organization, user, or group.
    const sanitize = (obj) => {
      const o = {};
      for (const [k, v] of Object.entries(obj || {})) {
        if (v === undefined || v === null || v === '') continue;
        o[k] = v;
      }
      return o;
    };
    const buildParams = (scope) => {
      const params = { count };
      if (scope.user) params.user = scope.user;
      if (scope.organization) params.organization = scope.organization;
      if (since) params.min_start_time = since; // ISO8601
      if (until) params.max_start_time = until; // ISO8601
      return sanitize(params);
    };

    const attempts = [];
    if (user || organization) {
      attempts.push({ user, organization });
    } else {
      const me = await this.getCurrentUser();
      // Prefer user scope first to avoid pulling entire organization events
      if (me.uri) attempts.push({ user: me.uri });
      if (me.current_organization) attempts.push({ organization: me.current_organization });
    }

    let lastErr;
    for (const scope of attempts) {
      let events = [];
      let pageToken = undefined;
      let nextPageUrl = null;
      const seenTokens = new Set();
      let pageCount = 0;

      try {
        do {
          let data;
          if (nextPageUrl) {
            const res = await this._requestWithRetry(nextPageUrl);
            data = res.data;
          } else {
            const baseParams = buildParams(scope);
            const params = pageToken ? { ...baseParams, page_token: String(pageToken).trim() } : baseParams;
            data = await this._requestWithRetry('/scheduled_events', { params });
          }

          if (data && data.collection) {
            const batch = data.collection;
            events = events.concat(batch);
            pageCount++;

            // Log progress
            const batchSize = batch.length;
            const totalSoFar = events.length;
            let dateRange = '';
            if (batchSize > 0) {
              const dates = batch.map(e => e.start_time).sort();
              const oldest = dates[0];
              const newest = dates[dates.length - 1];
              dateRange = `[${oldest} - ${newest}]`;
            }
            logger.info(`📅 Page ${pageCount}: Fetched ${batchSize} events. Total: ${totalSoFar}. Range: ${dateRange}`);
          }

          const { nextPage, nextPageToken } = this._getNextPageInfo(data);
          nextPageUrl = nextPage;
          pageToken = nextPage ? undefined : nextPageToken;

          if (!nextPageUrl && !pageToken) break;
          if (pageToken === 'null') {
            pageToken = undefined;
            break;
          }

          if (pageToken) {
            const normalizedToken = String(pageToken).trim();
            if (seenTokens.has(normalizedToken)) {
              logger.warn('Calendly pagination returned a repeated page token; stopping pagination to avoid infinite loop.');
              break;
            }
            seenTokens.add(normalizedToken);
            pageToken = normalizedToken;
          }
        } while (nextPageUrl || pageToken);
        // Post-filter by date window defensively in case API ignores params or returns broader scope
        if (since || until) {
          const min = since ? new Date(since).getTime() : null;
          const max = until ? new Date(until).getTime() : null;
          const beforeCount = events.length;
          events = events.filter(ev => {
            const start = new Date(ev.start_time || ev.start || ev.created_at || ev.updated_at || 0).getTime();
            if (min && start < min) return false;
            if (max && start > max) return false;
            return true;
          });
          if (beforeCount !== events.length) {
            logger.info(`Calendly post-filter trimmed events from ${beforeCount} to ${events.length} within date window.`);
          }
        }
        return events;
      } catch (err) {
        lastErr = err;
        const status = err.response && err.response.status;
        if (status === 400) {
          // If error complains about page_token, attempt a single retry without page_token even if we have one
          const details = err.response && err.response.data && err.response.data.details;
          const pageTokenIssue = Array.isArray(details) && details.some(d => d.parameter === 'page_token');
          if (pageTokenIssue) {
            logger.warn('400 due to page_token; retrying initial request without pagination for scope', JSON.stringify(scope));
            try {
              const data = await this._get('/scheduled_events', buildParams(scope));
              if (data && data.collection) return data.collection;
            } catch (e2) {
              logger.warn('Retry without page_token also failed:', e2.message);
            }
          }
          logger.warn('Scheduled events 400 with scope', JSON.stringify(scope), '- trying next scope if available.');
          continue; // try next scope
        }
        break; // non-400, don't retry with alternate scope
      }
    }
    logger.error('Failed to list scheduled events after trying available scopes:', lastErr && lastErr.message);
    throw lastErr || new Error('Unknown Calendly error');
  }

  // Fetch invitees for a single scheduled event UUID
  async listInviteesForEvent(eventUuid, { count = 100 } = {}) {
    if (!eventUuid) return [];
    const url = `/scheduled_events/${eventUuid}/invitees`;
    let invitees = [];

    try {
      let pageToken = undefined;
      do {
        const data = await this._requestWithRetry(url, { params: { count, page_token: pageToken } });
        const res = data.data;
        if (res && res.collection) invitees = invitees.concat(res.collection);
        pageToken = res && res.pagination ? res.pagination.next_page_token : undefined;
      } while (pageToken);
      return invitees;
    } catch (err) {
      logger.warn(`Failed to list invitees for event ${eventUuid}: ${err.message}`);
      return invitees; // return what we got so far
    }
  }

  // Convenience: fetch invitees across events in range; returns normalized invitee objects
  async listInviteesAcrossEvents({ since = null, until = null } = {}) {
    const events = await this.listScheduledEvents({ since, until, count: 100 });
    logger.info(`✅ Found ${events.length} scheduled events`);

    let allInvitees = [];
    let processedEvents = 0;
    
    for (const ev of events) {
      const uuid = ev.uri ? ev.uri.split('/').pop() : ev.uuid || ev.id;
      try {
        const invitees = await this.listInviteesForEvent(uuid);
        invitees.forEach((i) => {
          allInvitees.push({
            id: i.id || i.uri || i.resource,
            name: (i.name || i.full_name || (i.email ? i.email.split('@')[0] : '')).trim(),
            email: (i.email || (i.email_address ? i.email_address : null)),
            created_at: i.created_at || i.created || i.time,
            event_uuid: uuid,
            event_name: ev.name || ev.title || ev.event_type || null,
            raw: i
          });
        });
        processedEvents++;
        if (processedEvents % 10 === 0) {
          logger.info(`⏳ Processed invitees for ${processedEvents}/${events.length} events...`);
        }
      } catch (err) {
        logger.warn(`Skipping invitees for event ${uuid} due to error: ${err.message}`);
      }
    }

    return allInvitees;
  }
}

module.exports = new CalendlyClient();
