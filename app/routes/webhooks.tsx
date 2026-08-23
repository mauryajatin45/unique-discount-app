import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { orderQueue } from "../queue.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

    if (!admin) {
      return new Response();
    }

    // Ignore webhooks without a topic
    if (!topic) return new Response("OK", { status: 200 });
    
    console.log(`[SUCCESS] Verified Shopify App Webhook: ${topic} for shop ${shop}`);

    switch (topic) {
      case "APP_UNINSTALLED":
        if (session) {
          await prisma.session.deleteMany({ where: { shop } });
        }
        break;

      case "ORDERS_CREATE":
      case "ORDERS_PAID":
        // Prevent duplicate processing by checking log here or in queue
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
        console.log(`Ignoring unhandled webhook topic: ${topic}`);
        break;
    }

    return new Response("Webhook handled", { status: 200 });
  } catch (error: any) {
    // If authenticate.webhook fails (e.g. manual webhook with wrong signature), silently return 401
    // to avoid panicking the user with huge error logs, since manual webhooks are expected to fail.
    return new Response("Unauthorized", { status: 401 });
  }
};
