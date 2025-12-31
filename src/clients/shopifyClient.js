const axios = require('axios');
const logger = require('../utils/logger');

class ShopifyClient {
  constructor() {
    this.shopName = process.env.SHOPIFY_SHOP_NAME;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2024-10';
    
    if (!this.shopName || !this.accessToken) {
      logger.warn('Shopify configuration missing (SHOPIFY_SHOP_NAME or SHOPIFY_ACCESS_TOKEN).');
    }

    // Clean shop name - remove .myshopify.com if present
    const cleanShopName = this.shopName?.replace(/\.myshopify\.com$/, '');
    this.baseURL = `https://${cleanShopName}.myshopify.com/admin/api/${this.apiVersion}`;
    
    logger.info(`Shopify client initialized with shop: ${this.shopName}, clean: ${cleanShopName}`);
    logger.info(`Base URL: ${this.baseURL}`);

    this.http = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Debug interceptor to log outgoing requests
    this.http.interceptors.request.use((config) => {
      try {
        const params = config.params ? JSON.stringify(config.params) : '';
        const fullUrl = /^https?:\/\//i.test(config.url) ? config.url : `${config.baseURL}${config.url}`;
        logger.debug(`Shopify request: ${config.method?.toUpperCase()} ${fullUrl} ${params}`);
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
          logger.warn(`Shopify rate limit hit (429). Retrying after ${retryAfter}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter + 500)); // Add buffer
          continue;
        }

        if (status >= 500 && status < 600) {
          const delay = 1000 * Math.pow(2, i); // 1s, 2s, 4s
          logger.warn(`Shopify server error (${status}). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // For other errors, throw immediately
        throw err;
      }
    }
  }

  async getShopInfo() {
    try {
      const res = await this.http.get('/shop.json');
      return res.data && res.data.shop ? res.data.shop : res.data;
    } catch (err) {
      logger.error('Failed to fetch Shopify shop info:', err.message);
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
        logger.error(`Shopify API error ${status}`, err.message);
        if (data) {
          try {
            const snippet = typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data).slice(0, 500);
            logger.debug('Shopify response body:', snippet);
          } catch (_) {}
        }
      } else {
        logger.error('Shopify API error', err.message);
      }
      throw err;
    }
  }

  _parseNextPageInfo(linkHeader) {
    if (!linkHeader || typeof linkHeader !== 'string') return null;
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (!nextMatch) return null;
    const nextUrl = nextMatch[1];
    const pageInfoMatch = nextUrl.match(/[?&]page_info=([^&]+)/);
    return pageInfoMatch ? pageInfoMatch[1] : null;
  }

  _parseNextPageUrl(linkHeader) {
    if (!linkHeader || typeof linkHeader !== 'string') return null;
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return nextMatch ? nextMatch[1] : null;
  }

  // List orders with date range and pagination
  async listOrders({ since = null, until = null, status = 'any', limit = 250, fields = null } = {}) {
    const sanitize = (obj) => {
      const o = {};
      for (const [k, v] of Object.entries(obj || {})) {
        if (v === undefined || v === null || v === '') continue;
        o[k] = v;
      }
      return o;
    };

    const buildParams = (pageInfo = null) => {
      const params = { limit, status };
      if (since) params.created_at_min = since; // ISO8601
      if (until) params.created_at_max = until; // ISO8601
      if (fields) params.fields = fields; // e.g., 'id,email,created_at,customer'
      if (pageInfo) params.page_info = pageInfo;
      return sanitize(params);
    };

    let orders = [];
    let nextPageUrl = null;
    let attempts = 0;
    const maxAttempts = 50; // Prevent infinite loops

    try {
      do {
        const res = nextPageUrl
          ? await this._requestWithRetry(nextPageUrl)
          : await this._requestWithRetry('/orders.json', { params: buildParams(null) });
        const data = res.data;
        
        if (data && data.orders) {
          const batch = data.orders;
          orders = orders.concat(batch);
          
          // Log progress
          const batchSize = batch.length;
          const totalSoFar = orders.length;
          let dateRange = '';
          if (batchSize > 0) {
            // Shopify usually returns newest first by default, but let's check
            const dates = batch.map(o => o.created_at).sort();
            const oldest = dates[0];
            const newest = dates[dates.length - 1];
            dateRange = `[${oldest} - ${newest}]`;
          }
          logger.info(`📦 Page ${attempts + 1}: Fetched ${batchSize} orders. Total: ${totalSoFar}. Range: ${dateRange}`);
        }

        // Handle Shopify pagination via Link header
        const linkHeader = res.headers && res.headers.link ? res.headers.link : null;
        nextPageUrl = this._parseNextPageUrl(linkHeader);
        
        attempts++;
        if (attempts >= maxAttempts) {
          logger.warn(`Reached maximum pagination attempts (${maxAttempts}). Stopping.`);
          break;
        }
        
      } while (nextPageUrl);

      logger.info(`✅ Fetched ${orders.length} orders from Shopify`);
      return orders;
      
    } catch (err) {
      logger.error('Failed to list Shopify orders:', err.message);
      throw err;
    }
  }

  // Get customer details by ID
  async getCustomer(customerId) {
    if (!customerId) return null;
    
    try {
      const data = await this._get(`/customers/${customerId}.json`);
      return data && data.customer ? data.customer : data;
    } catch (err) {
      logger.warn(`Failed to fetch customer ${customerId}:`, err.message);
      return null;
    }
  }

  // List customers directly (alternative to order-based approach)
  async listCustomers({ since = null, until = null, limit = 250 } = {}) {
    const sanitize = (obj) => {
      const o = {};
      for (const [k, v] of Object.entries(obj || {})) {
        if (v === undefined || v === null || v === '') continue;
        o[k] = v;
      }
      return o;
    };

    const buildParams = (pageInfo = null) => {
      const params = { limit };
      if (since) params.created_at_min = since;
      if (until) params.created_at_max = until;
      if (pageInfo) params.page_info = pageInfo;
      return sanitize(params);
    };

    let customers = [];
    let nextPageUrl = null;
    let attempts = 0;
    const maxAttempts = 50;

    try {
      do {
        const res = nextPageUrl
          ? await this._requestWithRetry(nextPageUrl)
          : await this._requestWithRetry('/customers.json', { params: buildParams(null) });
        const data = res.data;
        
        if (data && data.customers) {
          const batch = data.customers;
          customers = customers.concat(batch);

          // Log progress
          const batchSize = batch.length;
          const totalSoFar = customers.length;
          let dateRange = '';
          if (batchSize > 0) {
            const dates = batch.map(c => c.created_at).sort();
            const oldest = dates[0];
            const newest = dates[dates.length - 1];
            dateRange = `[${oldest} - ${newest}]`;
          }
          logger.info(`🛍️  Page ${attempts + 1}: Fetched ${batchSize} customers. Total: ${totalSoFar}. Range: ${dateRange}`);

          // Handle pagination via Link header
          const linkHeader = res.headers && res.headers.link ? res.headers.link : null;
          nextPageUrl = this._parseNextPageUrl(linkHeader);
        } else {
          nextPageUrl = null;
        }
        
        attempts++;
        if (attempts >= maxAttempts) {
          logger.warn(`Reached maximum pagination attempts (${maxAttempts}). Stopping.`);
          break;
        }
        
      } while (nextPageUrl);

      logger.info(`✅ Fetched ${customers.length} customers from Shopify`);
      return customers;
      
    } catch (err) {
      logger.error('Failed to list Shopify customers:', err.message);
      throw err;
    }
  }

  // Extract emails from orders with normalization
  extractEmailsFromOrders(orders) {
    const emailMap = new Map();
    
    for (const order of orders) {
      let email = null;
      let name = '';
      
      // Priority: order.email > order.customer.email > order.billing_address.email
      if (order.email) {
        email = order.email.toLowerCase().trim();
      } else if (order.customer && order.customer.email) {
        email = order.customer.email.toLowerCase().trim();
      } else if (order.billing_address && order.billing_address.email) {
        email = order.billing_address.email.toLowerCase().trim();
      }
      
      if (!email) continue; // Skip orders without email
      
      // Extract name
      if (order.customer) {
        name = [order.customer.first_name, order.customer.last_name].filter(Boolean).join(' ');
      } else if (order.billing_address) {
        name = [order.billing_address.first_name, order.billing_address.last_name].filter(Boolean).join(' ');
      }
      
      // Dedupe by email, keep most recent order
      const existing = emailMap.get(email);
      const orderDate = new Date(order.created_at || 0);
      
      if (!existing || orderDate > new Date(existing.created_at || 0)) {
        emailMap.set(email, {
          email,
          name: name.trim() || email.split('@')[0],
          created_at: order.created_at,
          order_id: order.id,
          order_number: order.order_number || order.name,
          order_value: order.total_price || '0.00',
          raw_order: order
        });
      }
    }
    
    return Array.from(emailMap.values()).sort((a, b) => 
      new Date(a.created_at || 0) - new Date(b.created_at || 0)
    );
  }
}

module.exports = new ShopifyClient();
