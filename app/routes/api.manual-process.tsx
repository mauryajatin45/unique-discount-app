import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { orderQueue } from "../queue.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const body = await request.json();
    const { rawInput, force = false } = body;

    // ── 1. Input validation ──────────────────────────────────────────────────
    if (!rawInput?.trim()) {
      return json({ status: "validation_error", error: "Please enter an order number or ID." });
    }

    const input = rawInput.trim().replace(/^#/, "").trim();

    if (!input || !/^[\w-]+$/.test(input)) {
      return json({
        status: "validation_error",
        error: "Invalid format. Enter an order number like #92509 or a full Shopify order ID."
      });
    }

    // ── 2. Get a valid Shopify access token ──────────────────────────────────
    // Try offline session first, then any non-expired online session
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
      return json({
        status: "error",
        error: "No valid Shopify session found. Please reload the app from your Shopify admin panel and try again."
      });
    }

    // ── 3. Fetch order from Shopify (try sessions until one works) ───────────
    let orderData: any = null;
    const isFullId = /^\d{10,}$/.test(input); // Shopify IDs are 13+ digits

    for (const sess of validSessions) {
      let url: string;
      if (isFullId) {
        url = `https://${shop}/admin/api/2024-01/orders/${input}.json?status=any`;
      } else {
        url = `https://${shop}/admin/api/2024-01/orders.json?name=%23${encodeURIComponent(input)}&status=any&limit=5`;
      }

      const res = await fetch(url, {
        headers: { "X-Shopify-Access-Token": sess.accessToken, "Content-Type": "application/json" }
      });

      if (res.status === 401) continue; // try next session

      if (res.status === 404 || !res.ok) {
        break; // 404 is definitive — order doesn't exist
      }

      const data = await res.json();
      if (isFullId) {
        orderData = data.order || null;
      } else {
        orderData = data.orders?.[0] || null;
      }
      break;
    }

    // ── 4. Order not found ───────────────────────────────────────────────────
    if (!orderData) {
      return json({
        status: "not_found",
        error: `Order #${input} not found in your Shopify store. Please double-check the order number or ID.`
      });
    }

    const orderId = String(orderData.id);

    // ── 5. Already processed? ────────────────────────────────────────────────
    const existingLog = await prisma.log.findFirst({
      where: { orderId, shop }
    });
    if (existingLog) {
      return json({
        status: "already_processed",
        order: { id: orderId, name: orderData.name },
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

    // ── 6. Order cancelled? ──────────────────────────────────────────────────
    if (orderData.cancelled_at) {
      return json({
        status: "order_cancelled",
        error: `Order ${orderData.name} was cancelled on ${new Date(orderData.cancelled_at).toLocaleDateString("en-GB")}. Cancelled orders cannot be processed.`,
        order: { id: orderId, name: orderData.name }
      });
    }

    // ── 7. Order not paid? ───────────────────────────────────────────────────
    if (!["paid", "partially_paid"].includes(orderData.financial_status)) {
      return json({
        status: "not_paid",
        error: `Order ${orderData.name} is not paid yet (status: "${orderData.financial_status}"). Only paid orders generate discount codes.`,
        order: { id: orderId, name: orderData.name }
      });
    }

    // ── 8. App settings active? ──────────────────────────────────────────────
    const settings = await prisma.appSettings.findUnique({ where: { shop } });
    if (!settings) {
      return json({
        status: "error",
        error: "App settings not configured for this store. Please set up the app first."
      });
    }
    if (!settings.isActive) {
      return json({
        status: "error",
        error: "The discount offer is currently paused in your app settings. Enable it first, then process this order."
      });
    }
    if (!settings.targetProductId) {
      return json({
        status: "error",
        error: "No target product configured in app settings. Please configure the target product first."
      });
    }

    // ── 9. Trigger product check (skippable with force flag) ─────────────────
    const triggerMode = settings.triggerMode || "ALL_PRODUCTS";
    let hasTriggerProduct = true;

    if (!force && triggerMode === "SPECIFIC_PRODUCT" && settings.triggerProductId) {
      const triggerProductIds = settings.triggerProductId.split(",").map((s: string) => s.trim());
      const lineItems = orderData.line_items || [];
      hasTriggerProduct = lineItems.some((item: any) =>
        triggerProductIds.includes(`gid://shopify/Product/${item.product_id}`)
      );

      if (!hasTriggerProduct) {
        return json({
          status: "trigger_not_found",
          error: `Order ${orderData.name} doesn't contain the configured trigger product. Normally this order would be skipped automatically.`,
          hint: "You can force-process it anyway to generate codes manually for this customer.",
          order: {
            id: orderId,
            name: orderData.name,
            customerName: `${orderData.customer?.first_name || ""} ${orderData.customer?.last_name || ""}`.trim() || "Guest",
            lineItems: (orderData.line_items || []).map((li: any) => li.title).join(", ")
          },
          canForce: true
        });
      }
    }

    // ── 10. Already in queue? ────────────────────────────────────────────────
    try {
      const activeJobs = await orderQueue.getJobs(["waiting", "active", "delayed"]);
      const alreadyQueued = activeJobs.some(
        (job) => String(job.data.orderId) === orderId && job.data.shop === shop
      );
      if (alreadyQueued) {
        return json({
          status: "already_queued",
          error: `Order ${orderData.name} is currently being processed in the queue. Please wait a few seconds and check the Logs page.`,
          order: { id: orderId, name: orderData.name }
        });
      }
    } catch {
      // If queue check fails, continue anyway — don't block manual processing
    }

    // ── 11. Extract customer info for warnings ───────────────────────────────
    const customerName = `${orderData.customer?.first_name || ""} ${orderData.customer?.last_name || ""}`.trim() || "Guest";
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

    // ── 12. Push to queue ────────────────────────────────────────────────────
    const jobName = `manual-${shop}-${orderId}-${Date.now()}`;
    await orderQueue.add(jobName, {
      shop,
      orderId,
      orderData,
      isOdooOrder: false,
      forceProcess: force // tells queue worker to skip trigger check
    });

    console.log(`[ManualProcess] Queued order ${orderData.name} (${orderId}) for shop ${shop}`);

    return json({
      status: "queued",
      order: {
        id: orderId,
        name: orderData.name,
        customerName,
        customerPhone,
        financialStatus: orderData.financial_status,
        totalPrice: orderData.total_price,
        currency: orderData.currency,
        createdAt: orderData.created_at,
        lineItems: (orderData.line_items || []).map((li: any) => li.title)
      },
      warnings
    });

  } catch (err: any) {
    console.error("[ManualProcess] Unexpected error:", err);
    return json({ status: "error", error: err.message || "Internal server error" }, { status: 500 });
  }
};
