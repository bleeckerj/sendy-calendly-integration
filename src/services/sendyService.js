const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Sendy API service for managing email subscribers
 */
class SendyService {
  constructor() {
    this.baseURL = process.env.SENDY_INSTALLATION_URL;
    this.apiKey = process.env.SENDY_API_KEY;
    
    if (!this.baseURL || !this.apiKey) {
      throw new Error('Sendy configuration missing. Check SENDY_INSTALLATION_URL and SENDY_API_KEY');
    }
  }

  /**
   * Add a subscriber to a Sendy list
   */
  async addSubscriber({ email, name, listId }) {
    try {
      const url = `${this.baseURL}/subscribe`;
      
      const data = new URLSearchParams({
        api_key: this.apiKey,
        email: email,
        name: name || '',
        list: listId,
        boolean: 'true' // Return true/false instead of text
      });

      logger.info(`Adding subscriber to Sendy: ${email}`);

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      const result = response.data;
      
      // Sendy API responses
      if (result === 'true' || result === true) {
        return { success: true, message: 'Subscriber added successfully' };
      } else if (result === 'Already subscribed.') {
        logger.info(`Email ${email} is already subscribed`);
        return { success: true, message: 'Already subscribed' };
      } else {
        return { success: false, message: result };
      }
    } catch (error) {
      logger.error('Error adding subscriber to Sendy:', error.message);
      
      if (error.response) {
        return { 
          success: false, 
          message: `Sendy API error: ${error.response.status} - ${error.response.data}` 
        };
      } else if (error.request) {
        return { 
          success: false, 
          message: 'Failed to connect to Sendy API' 
        };
      } else {
        return { 
          success: false, 
          message: error.message 
        };
      }
    }
  }

  /**
   * Check if a subscriber exists in a list
   */
  async checkSubscriber({ email, listId }) {
    try {
      const url = `${this.baseURL}/api/subscribers/subscription-status.php`;
      
      const data = new URLSearchParams({
        api_key: this.apiKey,
        email: email,
        list_id: listId
      });

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      const status = response.data;
      
      return {
        success: true,
        status: status,
        isSubscribed: status === 'Subscribed'
      };
    } catch (error) {
      logger.error('Error checking subscriber status:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get subscriber count for a list
   */
  async getSubscriberCount(listId) {
    try {
      const url = `${this.baseURL}/api/subscribers/active-subscriber-count.php`;
      
      const data = new URLSearchParams({
        api_key: this.apiKey,
        list_id: listId
      });

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000
      });

      const count = parseInt(response.data);
      
      return {
        success: true,
        count: isNaN(count) ? 0 : count
      };
    } catch (error) {
      logger.error('Error getting subscriber count:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new SendyService();