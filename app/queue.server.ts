import type { Job } from "bullmq";
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import prisma from "./db.server";
import shopify from "./shopify.server";
import { generateLoyaltyCard } from "./image.server";

// 1. Setup Redis Connection
const redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

// 2. Define the Queue
export const orderQueue = new Queue("orderQueue", {
  connection: redisConnection,
});

// 3. Define the Worker
const worker = new Worker(
  "orderQueue",
  async (job: Job) => {
    const { shop, orderId, orderData, isOdooOrder } = job.data;
    console.log(`Processing order ${orderId} for shop ${shop}`);

    try {
      // 0. Prevent duplicate processing (Shopify often sends both ORDERS_CREATE and ORDERS_PAID)
      const existingLog = await prisma.log.findFirst({
        where: { shop, orderId: String(orderId) }
      });
      if (existingLog) {
        console.log(`Order ${orderId} has already been processed. Skipping to prevent duplicate codes.`);
        return;
      }
      // Step A: Fetch settings for the shop
      const settings = await prisma.appSettings.findUnique({
        where: { shop },
      });

      if (!settings || !settings.isActive) {
        console.log(`Offer not active for shop ${shop}. Skipping.`);
        return;
      }
      
      if (isOdooOrder && settings.isOdooActive === false) {
        console.log(`Odoo integration is paused for shop ${shop}. Skipping Odoo order ${orderId}.`);
        return;
      }

      // Target product to apply discount to
      const targetProductId = settings.targetProductId;

      if (!targetProductId) {
        console.log(`No target product configured for ${shop}. Skipping.`);
        return;
      }

      // Check trigger condition
      const triggerMode = settings.triggerMode || "ALL_PRODUCTS";
      const lineItems = orderData.line_items || [];

      if (triggerMode === "SPECIFIC_PRODUCT") {
        const triggerProductIdStr = settings.triggerProductId;
        if (!triggerProductIdStr) {
          console.log(`Specific product trigger selected but no trigger product configured for ${shop}. Skipping.`);
          return;
        }
        
        let hasTriggerProduct = false;
        
        if (isOdooOrder) {
          if (settings.odooTriggerProductId && settings.odooTriggerProductId.trim() !== "") {
            const odooTriggerIds = settings.odooTriggerProductId.split(',').map(id => id.trim());
            // Check if any of the Odoo line items match the specified Odoo Product ID or SKU
            hasTriggerProduct = lineItems.some(
              (item: any) => odooTriggerIds.includes(String(item.product_id)) || odooTriggerIds.includes(String(item.sku)) || odooTriggerIds.includes(String(item.id))
            );
            console.log(`[Odoo] Checked strict Odoo Product ID mapping for order ${orderId}. Match found: ${hasTriggerProduct}`);
          } else {
            hasTriggerProduct = true;
            console.log(`[Odoo] No Odoo trigger ID mapped in settings, allowing all Odoo webhooks to pass for order ${orderId}`);
          }
        } else {
          const triggerProductIds = triggerProductIdStr.split(',');
          hasTriggerProduct = lineItems.some(
            (item: any) => triggerProductIds.includes(`gid://shopify/Product/${item.product_id}`)
          );
        }
        
        if (!hasTriggerProduct) {
          console.log(`Order ${orderId} does not contain trigger product. Skipping.`);
          return;
        }
      }

      // Get Offline Session for GraphQL API
      const { admin } = await shopify.unauthenticated.admin(shop);

      // Calculate expiration date (6 months from now)
      const endsAt = new Date();
      endsAt.setMonth(endsAt.getMonth() + 6);
      const endsAtISO = endsAt.toISOString();

      const customerName = orderData.customer?.first_name || "Customer";
      const customerPhone = orderData.customer?.phone || orderData.phone || orderData.billing_address?.phone || orderData.shipping_address?.phone || "";
      console.log(`[Order ${orderId}] Extracted Customer: ${customerName}, Phone: ${customerPhone}`);

      const discountPercentageProduct = parseFloat(settings.discountPercentageProduct?.toString() || "10.0") / 100;
      const discountPercentageStore = parseFloat(settings.discountPercentageStore?.toString() || "15.0") / 100;

      // Generate random suffix for unique codes
      const suffix1 = Math.random().toString(36).substring(2, 8).toUpperCase();
      const code1 = `TARGET-${suffix1}`;

      // Step B: Create Price Rule for Code 1 (Specific Product)
      const priceRule1Response = await admin.graphql(`
        mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  codes(first: 1) {
                    nodes {
                      code
                    }
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          basicCodeDiscount: {
            title: `Specific Product Discount - ${orderId}`,
            code: code1,
            startsAt: new Date().toISOString(),
            endsAt: endsAtISO,
            customerSelection: orderData.customer?.id ? {
              customers: {
                add: [`gid://shopify/Customer/${orderData.customer.id}`]
              }
            } : { all: true },
            customerGets: {
              value: {
                percentage: discountPercentageProduct
              },
              items: {
                products: {
                  productsToAdd: targetProductId.split(',')
                }
              }
            },
            appliesOncePerCustomer: true,
            usageLimit: 1
          }
        }
      });

      const priceRule1Data = await priceRule1Response.json();
      console.log('Price Rule 1 Created:', priceRule1Data);

      // Generate Code 2
      const suffix2 = Math.random().toString(36).substring(2, 8).toUpperCase();
      const code2 = `STORE-${suffix2}`;

      // Step C: Create Price Rule for Code 2 (Storewide excluding target product)
      const priceRule2Response = await admin.graphql(`
        mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          basicCodeDiscount: {
            title: `Storewide Discount (Excluding Target) - ${orderId}`,
            code: code2,
            startsAt: new Date().toISOString(),
            endsAt: endsAtISO,
            customerSelection: orderData.customer?.id ? {
              customers: {
                add: [`gid://shopify/Customer/${orderData.customer.id}`]
              }
            } : { all: true },
            customerGets: {
              value: {
                percentage: discountPercentageStore
              },
              items: {
                all: true
              }
            },
            appliesOncePerCustomer: true,
            usageLimit: 1
          }
        }
      });

      const priceRule2Data = await priceRule2Response.json();
      console.log('Price Rule 2 Created:', priceRule2Data);

      // (We technically would need to use a different API or complex graphQL structure to EXCLUDE a product from an ALL items discount, 
      // but for standard Shopify Basic discounts, exclusions aren't natively supported on all-items without using custom Collections. 
      // For the scope of this app architecture, we create the general code here).

      // Step D: Phase 4 (Visual Assembly) - Generate Image
      console.log(`Generating loyalty card image for ${customerName}...`);
      const loyaltyCardUrl = await generateLoyaltyCard(
        String(orderId), 
        customerName, 
        code1, 
        code2
      );
      console.log(`Loyalty card generated successfully: ${loyaltyCardUrl}`);

      // Step E: Phase 5 (The Delivery) - Send to BusinessChat.io Webhook
      console.log(`Sending WhatsApp message trigger to BusinessChat webhook for ${customerPhone}...`);
      try {
        const payload = {
          phoneNumber: customerPhone,
          customerName: customerName,
          loyaltyCardUrl: loyaltyCardUrl,
          productCode: code1,
          storewideCode: code2
        };
        console.log(`Webhook Payload:`, JSON.stringify(payload));
        
        const webhookResponse = await fetch("https://kotlin-web-api.businesschat.io/webhook/18613/automations/23112", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        
        const responseText = await webhookResponse.text();
        console.log(`BusinessChat Webhook Response Status: ${webhookResponse.status}`);
        console.log(`BusinessChat Webhook Response Body: ${responseText}`);
        
        if (!webhookResponse.ok) {
           console.error(`BusinessChat returned an error: ${responseText}`);
        }
      } catch (err) {
        console.error("Failed to trigger BusinessChat Webhook (Network/Code Error):", err);
      }
      // Save log to database (Delivery Status removed as per client request, so no need to track it)
      await prisma.log.create({
        data: {
          shop,
          orderId: String(orderId),
          customerName,
          productCode: code1,
          storewideCode: code2,
          triggerModeUsed: triggerMode,
          triggerProductIdUsed: settings.triggerProductId,
          targetProductIdUsed: targetProductId,
          discountPercentageProductUsed: settings.discountPercentageProduct,
          discountPercentageStoreUsed: settings.discountPercentageStore
        }
      });

      // Cleanup old logs
      const retentionDays = settings.logRetentionDays || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      await prisma.log.deleteMany({
        where: {
          shop,
          createdAt: {
            lt: cutoffDate,
          }
        }
      });

      console.log(`Successfully generated and logged codes ${code1} and ${code2} for order ${orderId}`);

    } catch (error) {
      console.error(`Error processing job for order ${orderId}:`, error);
      throw error;
    }
  },
  { connection: redisConnection }
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.log(`Job ${job?.id} failed with ${err.message}`);
});


export const backfillQueue = new Queue("backfillQueue", {
  connection: redisConnection
});

const backfillWorker = new Worker(
  "backfillQueue",
  async (job) => {
    const { shop, orderId, runId, itemId } = job.data;
    console.log(`[Backfill] Processing order ${orderId} for run ${runId}`);
    
    try {
      
      const { session } = await shopify.unauthenticated.admin(shop);
      
      const response = await fetch(`https://${shop}/admin/api/2024-01/orders/${orderId}.json`, {
        headers: {
          'X-Shopify-Access-Token': session.accessToken
        }
      });
      const orderData = await response.json();
      
      if (!orderData || !orderData.order) {
         throw new Error("Order not found");
      }
      
      // Enqueue to normal order queue
      await orderQueue.add("processOrder", {
        shop,
        orderId,
        orderData: orderData.order,
      });
      
      await prisma.backfillItem.update({
        where: { id: itemId },
        data: { status: "SENT" }
      });
      
      await prisma.backfillRun.update({
        where: { id: runId },
        data: { totalSent: { increment: 1 } }
      });
      
    } catch (err) {
      console.error(`[Backfill] Error for order ${orderId}:`, err);
      
      await prisma.backfillItem.update({
        where: { id: itemId },
        data: { status: "FAILED", errorMessage: err.message }
      });
      
      await prisma.backfillRun.update({
        where: { id: runId },
        data: { totalFailed: { increment: 1 } }
      });
      
      throw err;
    }
  },
  { connection: redisConnection }
);

backfillWorker.on("completed", (job) => {
  console.log(`[Backfill] Job ${job.id} completed`);
});
backfillWorker.on("failed", (job, err) => {
  console.error(`[Backfill] Job ${job.id} failed: ${err.message}`);
});
