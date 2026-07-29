import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { orderQueue } from "../queue.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  console.log(`Received webhook ${topic} for shop ${shop}`);

  if (!admin) {
    return new Response();
  }

  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        await prisma.session.deleteMany({ where: { shop } });
      }
      break;

    case "ORDERS_CREATE":
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

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      // Handle privacy requests here
      break;
      
    default:
      console.log(`Unhandled webhook topic: ${topic}`);
      break;
  }

  return new Response("Webhook handled", { status: 200 });
};
