const axios = require('axios');
const prisma = require('../db/client');

/**
 * Webhook Service
 * Handles webhook notifications for various events
 */

class WebhookService {
  /**
   * Trigger webhooks for a specific event
   */
  static async trigger(eventType, data) {
    try {
      // Get all active webhooks for this event
      const webhooks = await prisma.webhook.findMany({
        where: {
          active: true,
          events: {
            has: eventType
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
   */
  static async sendWebhook(webhook, eventType, data, retryCount = 0) {
    try {
      const payload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data
      };

      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'SafeAPI-Bridge-Webhook/1.0',
        ...(webhook.secret && { 'X-Webhook-Secret': webhook.secret }),
        ...(webhook.headers && typeof webhook.headers === 'object' ? webhook.headers : {})
      };

      const response = await axios.post(webhook.url, payload, {
        headers,
        timeout: webhook.timeout || 5000
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
