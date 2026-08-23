import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { orderQueue } from "../queue.server";
import crypto from "crypto";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic");
  const shop = request.headers.get("x-shopify-shop-domain");

  if (!hmacHeader || !topic || !shop) {
    console.error("Missing Shopify webhook headers", { hmacHeader, topic, shop });
    return new Response("Missing headers", { status: 400 });
  }

  const rawBody = await request.text();

  // 1. Try to verify using the App's API Secret (for App Webhooks)
  let isValid = false;
  const appSecret = process.env.SHOPIFY_API_SECRET || "";
  const appHash = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("base64");
  
  if (appHash === hmacHeader) {
    isValid = true;
  } else {
    // 2. Fallback: Try to verify using the Store's Manual Webhook Secret
    const storeSecret = process.env.STORE_WEBHOOK_SECRET || "";
    if (storeSecret) {
      const storeHash = crypto.createHmac("sha256", storeSecret).update(rawBody, "utf8").digest("base64");
      if (storeHash === hmacHeader) {
        isValid = true;
      }
    }
  }

  if (!isValid) {
    console.error(`Webhook HMAC validation failed for shop: ${shop}`);
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = JSON.parse(rawBody);
  console.log(`Successfully verified and received webhook ${topic} for shop ${shop}`);

  switch (topic) {
    case "app/uninstalled":
    case "APP_UNINSTALLED":
      await prisma.session.deleteMany({ where: { shop } });
      break;

    case "orders/create":
    case "ORDERS_CREATE":
    case "orders/paid":
    case "ORDERS_PAID":
      // Dispatch to BullMQ for asynchronous processing
      await orderQueue.add("processOrder", {
        shop,
        orderId: payload.id,
        orderData: payload,
      }, {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      });
      console.log(`Dispatched ${topic} for order ${payload.id} to queue.`);
      break;

    default:
      console.log(`Unhandled webhook topic: ${topic}`);
      break;
  }

  return new Response("Webhook handled", { status: 200 });
};
