import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { orderQueue } from "../queue.server";
import prisma from "../db.server";

// Hardcoded default shop for Odoo orders (since Odoo doesn't know about Shopify shop domains)
const DEFAULT_SHOP = "althenayanhoney.myshopify.com";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization") || url.searchParams.get("api_key");
  if (apiKey !== "b2a34955492d4f71053e5042477dd32d693f598f" && apiKey !== "Bearer b2a34955492d4f71053e5042477dd32d693f598f") {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    
    // Odoo payload expectations:
    // {
    //   "order_id": "SO12345",
    //   "customer_name": "John Doe",
    //   "customer_phone": "+1234567890",
    //   "bypass_product_check": true // optional flag if they do the filtering in Odoo
    // }
    
    // Extract Order ID (Odoo native webhook sends "name" for the SO reference)
    
    const displayName = body.display_name || body.name || "";
    if (displayName.toUpperCase().includes("SHOPIFY")) {
      console.log(`[Odoo Webhook] Rejected payload because it is a Shopify-synced order: ${displayName}`);
      return json({ success: true, message: "Ignored Shopify-synced order" });
    }
  
    const orderId = body.order_id || body.name || body.id || `ODOO-${Date.now()}`;
    
    // Extract Customer Name (Odoo native sends partner_id as [ID, "Name"])
    let customerName = "Customer";
    if (body.customer_name) customerName = body.customer_name;
    else if (body.partner_name) customerName = body.partner_name;
    else if (Array.isArray(body.partner_id) && body.partner_id.length > 1) customerName = body.partner_id[1];
    
    // Extract Customer Phone (Search through all keys for something containing 'phone' or 'mobile')
    let customerPhone = body.customer_phone || body.partner_phone || body.phone || "";
    if (!customerPhone) {
      for (const [key, value] of Object.entries(body)) {
        if ((key.toLowerCase().includes('phone') || key.toLowerCase().includes('mobile')) && typeof value === 'string') {
          customerPhone = value;
          break;
        }
      }
    }
    
    console.log(`[Odoo Webhook Raw Payload] `, JSON.stringify(body));
    
    // We map this into a Shopify-like orderData object for the queue
    const orderData = {
      id: orderId,
      customer: {
        first_name: customerName,
        phone: customerPhone
      },
      line_items: body.line_items || []
    };

    // Add to queue with the isOdoo flag so queue.server.ts can bypass strict Shopify Product ID checks
    await orderQueue.add("processOrder", {
      shop: DEFAULT_SHOP,
      orderId: `ODOO-${orderId}`,
      orderData: orderData,
      isOdooOrder: true
    }, {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    });

    console.log(`[Odoo Webhook] Successfully queued Odoo order ${orderId}`);
    return json({ success: true, message: "Order queued successfully" });
    
  } catch (err: any) {
    console.error("[Odoo Webhook] Error parsing payload:", err);
    return json({ error: "Invalid payload" }, { status: 400 });
  }
};
