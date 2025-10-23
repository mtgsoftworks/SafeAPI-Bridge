const axios = require('axios');
const prisma = require('../db/client');
const { validateURL } = require('../utils/urlValidator');
const { logSSRFAttempt } = require('../utils/securityLogger');

/**
 * Webhook Service
 * Handles webhook notifications for various events
 * Now with SSRF protection
 */

class WebhookService {
  /**
   * Trigger webhooks for a specific event
   */
  static async trigger(eventType, data) {
    try {
      // Get all active webhooks for this event
      // SQLite uses comma-separated string for events
      const webhooks = await prisma.webhook.findMany({
        where: {
          active: true,
          events: {
            contains: eventType  // SQLite-compatible: checks if string contains eventType
          }
        }
      });

      if (webhooks.length === 0) {
        return;
      }

      // Send webhooks in parallel
      const promises = webhooks.map(webhook =>
        this.sendWebhook(webhook, eventType, data)
      );

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Webhook trigger error:', error);
    }
  }

  /**
   * Send individual webhook with retry logic
   * Now with SSRF validation on every send
   */
  static async sendWebhook(webhook, eventType, data, retryCount = 0) {
    try {
      // Double-check URL for SSRF protection (defense in depth)
      const urlValidation = validateURL(webhook.url, 'webhook-service');
      if (!urlValidation.valid) {
        logSSRFAttempt(webhook.url, 'webhook-service', `SSRF attempt in webhook send: ${urlValidation.error}`);
        console.error(`🚫 SSRF protection blocked webhook URL: ${webhook.url}`);

        // Deactivate malicious webhook
        await prisma.webhook.update({
          where: { id: webhook.id },
          data: { active: false }
        });

        throw new Error(`SSRF protection: ${urlValidation.error}`);
      }

      const payload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data
      };

      // Parse headers if it's a JSON string (SQLite stores as string)
      let parsedHeaders = {};
      if (webhook.headers) {
        try {
          parsedHeaders = typeof webhook.headers === 'string'
            ? JSON.parse(webhook.headers)
            : webhook.headers;
        } catch (e) {
          console.warn('Failed to parse webhook headers:', e);
        }
      }

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'SafeAPI-Bridge-Webhook/1.0',
        ...(webhook.secret && { 'X-Webhook-Secret': webhook.secret }),
        ...parsedHeaders
      };

      const response = await axios.post(webhook.url, payload, {
        headers,
        timeout: webhook.timeout || 5000,
        maxRedirects: 0 // Prevent redirect-based SSRF
      });

      // Update stats
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          totalCalls: { increment: 1 },
          lastCall: new Date()
        }
      });

      console.log(`✅ Webhook sent: ${eventType} to ${webhook.url}`);
      return response.data;

    } catch (error) {
      console.error(`❌ Webhook failed: ${eventType} to ${webhook.url}`, error.message);

      // Retry with exponential backoff
      if (retryCount < webhook.retryCount) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendWebhook(webhook, eventType, data, retryCount + 1);
      }

      // Update failed stats
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          failedCalls: { increment: 1 }
        }
      });
    }
  }

  /**
   * Test webhook
   */
  static async test(webhookId) {
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId }
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    return this.sendWebhook(webhook, 'test', {
      message: 'This is a test webhook',
      webhookId: webhook.id
    });
  }
}

module.exports = WebhookService;
