import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { orderQueue } from "../queue.server";
import { odooAuthenticate, odooSearchOrder } from "../odoo.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const body = await request.json();
    const { rawInput, force = false, platform = "shopify" } = body;

    // ── 1. Input validation ──────────────────────────────────────────────────
    if (!rawInput?.trim()) {
      return json({ status: "validation_error", error: "Please enter an order number or ID." });
    }

    const input = rawInput.trim().replace(/^#/, "").trim();

    if (!input) {
      return json({
        status: "validation_error",
        error: "Invalid format. Enter a valid order number or ID."
      });
    }

    let orderData: any = null;
    let orderId: string = "";
    let isOdooOrder = platform === "odoo";
    let internalOrderId = ""; // used to store the specific string we check DB for

    // ── 2. Fetch order data (Shopify or Odoo) ────────────────────────────────
    if (platform === "shopify") {
      const allSessions = await prisma.session.findMany({
        where: { shop, accessToken: { not: "" } }
      });
      const now = new Date();
      const validSessions = allSessions
        .filter(s => !s.isOnline || !s.expiresAt || new Date(s.expiresAt) > now)
        .sort((a, b) => {
          if (!a.isOnline && b.isOnline) return -1;
          if (a.isOnline && !b.isOnline) return 1;
          return 0;
        });

      if (validSessions.length === 0) {
        return json({ status: "error", error: "No valid Shopify session found. Please reload the app." });
      }

      const isFullId = /^\d{10,}$/.test(input);
      for (const sess of validSessions) {
        let url = isFullId 
          ? `https://${shop}/admin/api/2024-01/orders/${input}.json?status=any`
          : `https://${shop}/admin/api/2024-01/orders.json?name=%23${encodeURIComponent(input)}&status=any&limit=5`;
        const res = await fetch(url, { headers: { "X-Shopify-Access-Token": sess.accessToken, "Content-Type": "application/json" } });
        if (res.status === 401) continue;
        if (res.status === 404 || !res.ok) break;
        const data = await res.json();
        orderData = isFullId ? (data.order || null) : (data.orders?.[0] || null);
        break;
      }
      
      if (!orderData) {
        return json({ status: "not_found", error: `Shopify order #${input} not found.` });
      }
      
      orderId = String(orderData.id);
      internalOrderId = orderId;
      
      if (orderData.cancelled_at) {
        return json({
          status: "order_cancelled",
          error: `Shopify order ${orderData.name} was cancelled. Cannot process.`,
          order: { id: orderId, name: orderData.name }
        });
      }
      if (!["paid", "partially_paid"].includes(orderData.financial_status)) {
        return json({
          status: "not_paid",
          error: `Shopify order ${orderData.name} is not paid (status: ${orderData.financial_status}).`,
          order: { id: orderId, name: orderData.name }
        });
      }
      
    } else {
      // ── Odoo Fetch ────────────────────────────────────────────────────────
      try {
        const sessionId = await odooAuthenticate();
        const odooOrder = await odooSearchOrder(sessionId, input);
        
        if (!odooOrder) {
          return json({ status: "not_found", error: `Odoo order ${input} not found.` });
        }
        
        // Map Odoo data to our unified structure
        const odooId = odooOrder.id;
        const odooName = odooOrder.name || odooOrder.display_name;
        
        let customerName = "Customer";
        if (Array.isArray(odooOrder.partner_id) && odooOrder.partner_id.length > 1) {
          customerName = odooOrder.partner_id[1];
        }
        
        const customerPhone = odooOrder.partner_mobile || odooOrder.partner_phone || "";
        
        orderData = {
          id: odooId,
          name: odooName,
          customer: { first_name: customerName, phone: customerPhone },
          line_items: odooOrder.order_line || [],
          financial_status: odooOrder.state === "cancel" ? "cancelled" : "paid", // simplified
          total_price: odooOrder.amount_total,
          currency: Array.isArray(odooOrder.currency_id) ? odooOrder.currency_id[1] : "",
          created_at: odooOrder.create_date
        };
        
        orderId = String(odooId);
        internalOrderId = `ODOO-${orderId}`; // what we use in our DB for Odoo orders
        
        if (odooOrder.state === "cancel") {
          return json({
            status: "order_cancelled",
            error: `Odoo order ${odooName} was cancelled. Cannot process.`,
            order: { id: internalOrderId, name: odooName }
          });
        }
        
      } catch (err: any) {
        return json({ status: "error", error: `Failed to connect to Odoo: ${err.message}` });
      }
    }

    // ── 3. Already processed? ────────────────────────────────────────────────
    // We check against internalOrderId which is 'ODOO-141623' or '7215957082368'
    const existingLog = await prisma.log.findFirst({
      where: { orderId: internalOrderId, shop: isOdooOrder ? "althenayanhoney.myshopify.com" : shop }
    });
    
    if (existingLog) {
      return json({
        status: "already_processed",
        order: { id: internalOrderId, name: orderData.name },
        existing: {
          id: existingLog.id,
          orderName: existingLog.orderName || existingLog.orderId,
          productCode: existingLog.productCode,
          storewideCode: existingLog.storewideCode,
          customerName: existingLog.customerName,
          customerPhone: existingLog.customerPhone,
          createdAt: existingLog.createdAt
        }
      });
    }

    // ── 4. App settings active? ──────────────────────────────────────────────
    const settings = await prisma.appSettings.findUnique({ where: { shop } });
    if (!settings) {
      return json({ status: "error", error: "App settings not configured for this store." });
    }
    if (!settings.isActive) {
      return json({ status: "error", error: "The discount offer is currently paused in your app settings." });
    }
    if (isOdooOrder && settings.isOdooActive === false) {
      return json({ status: "error", error: "Odoo integration is currently paused in your app settings." });
    }
    if (!settings.targetProductId) {
      return json({ status: "error", error: "No target product configured in app settings." });
    }

    // ── 5. Trigger product check (skippable with force flag) ─────────────────
    const triggerMode = settings.triggerMode || "ALL_PRODUCTS";
    let hasTriggerProduct = true;

    if (!force && triggerMode === "SPECIFIC_PRODUCT") {
      if (isOdooOrder) {
        if (settings.odooTriggerProductId && settings.odooTriggerProductId.trim() !== "") {
          const odooTriggerIds = settings.odooTriggerProductId.split(',').map((id: string) => id.trim());
          const lineItems = orderData.line_items || [];
          hasTriggerProduct = lineItems.some(
            (item: any) => odooTriggerIds.includes(String(item)) || odooTriggerIds.includes(String(item.product_id)) || odooTriggerIds.includes(String(item.sku))
          );
        }
      } else if (settings.triggerProductId) {
        const triggerProductIds = settings.triggerProductId.split(",").map((s: string) => s.trim());
        const lineItems = orderData.line_items || [];
        hasTriggerProduct = lineItems.some((item: any) =>
          triggerProductIds.includes(`gid://shopify/Product/${item.product_id}`)
        );
      }

      if (!hasTriggerProduct) {
        return json({
          status: "trigger_not_found",
          error: `Order ${orderData.name} doesn't contain the configured trigger product. Normally this order would be skipped automatically.`,
          hint: "You can force-process it anyway to generate codes manually for this customer.",
          order: {
            id: internalOrderId,
            name: orderData.name,
            customerName: `${orderData.customer?.first_name || ""} ${orderData.customer?.last_name || ""}`.trim() || "Guest",
            lineItems: isOdooOrder ? `Odoo Line Item IDs: ${(orderData.line_items || []).join(", ")}` : (orderData.line_items || []).map((li: any) => li.title).join(", ")
          },
          canForce: true
        });
      }
    }

    // ── 6. Already in queue? ────────────────────────────────────────────────
    try {
      const activeJobs = await orderQueue.getJobs(["waiting", "active", "delayed"]);
      const alreadyQueued = activeJobs.some(
        (job) => String(job.data.orderId) === internalOrderId && job.data.shop === shop
      );
      if (alreadyQueued) {
        return json({
          status: "already_queued",
          error: `Order ${orderData.name} is currently being processed in the queue. Please wait a few seconds and check the Logs page.`,
          order: { id: internalOrderId, name: orderData.name }
        });
      }
    } catch {}

    // ── 7. Extract customer info for warnings ───────────────────────────────
    const customerName = `${orderData.customer?.first_name || ""} ${orderData.customer?.last_name || ""}`.trim() || "Customer";
    const customerPhone =
      orderData.customer?.phone ||
      orderData.phone ||
      orderData.billing_address?.phone ||
      orderData.shipping_address?.phone ||
      null;

    const warnings: string[] = [];
    if (!customerPhone) {
      warnings.push("No phone number found on this order. Discount codes will be generated but the WhatsApp message cannot be sent.");
    }
    if (force) {
      warnings.push("Force mode: Processing without trigger product check.");
    }

    // ── 8. Push to queue ────────────────────────────────────────────────────
    const jobName = `manual-${shop}-${internalOrderId}-${Date.now()}`;
    await orderQueue.add(jobName, {
      shop: isOdooOrder ? "althenayanhoney.myshopify.com" : shop,
      orderId: internalOrderId,
      orderData,
      isOdooOrder,
      forceProcess: force
    });

    console.log(`[ManualProcess] Queued order ${orderData.name} (${internalOrderId}) for shop ${shop} [Platform: ${platform}]`);

    return json({
      status: "queued",
      order: {
        id: internalOrderId,
        name: orderData.name,
        customerName,
        customerPhone,
        financialStatus: orderData.financial_status,
        totalPrice: orderData.total_price,
        currency: orderData.currency,
        createdAt: orderData.created_at,
        lineItems: isOdooOrder ? `Odoo Line IDs: ${(orderData.line_items || []).join(", ")}` : (orderData.line_items || []).map((li: any) => li.title)
      },
      warnings
    });

  } catch (err: any) {
    console.error("[ManualProcess] Unexpected error:", err);
    return json({ status: "error", error: err.message || "Internal server error" }, { status: 500 });
  }
};
