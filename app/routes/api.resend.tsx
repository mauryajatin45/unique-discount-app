import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { requireAppUser } from "../auth.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { session } = await authenticate.admin(request);
    const user = await requireAppUser(request, "canViewLogs");

    if (!user) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { logId } = body;

    if (!logId) {
      return json({ error: "Missing logId" }, { status: 400 });
    }

    // Fetch the log entry
    const log = await prisma.log.findFirst({
      where: { id: parseInt(logId, 10), shop: session.shop }
    });

    if (!log) {
      return json({ error: "Log entry not found" }, { status: 404 });
    }

    if (!log.customerPhone) {
      return json({ error: "No phone number stored for this log entry. Cannot resend." }, { status: 400 });
    }

    // Rebuild the payload exactly as the original webhook call
    const payload = {
      phoneNumber: log.customerPhone,
      customerName: log.customerName || "Customer",
      loyaltyCardUrl: `${process.env.APP_URL || `https://${session.shop}`}/cards/${log.orderId}.pdf`,
      productCode: log.productCode,
      storewideCode: log.storewideCode
    };

    console.log(`[Resend] Triggering BusinessChat webhook for log ${logId}, phone: ${log.customerPhone}`);
    console.log(`[Resend] Payload:`, JSON.stringify(payload));

    const webhookUrl = process.env.BUSINESSCHAT_WEBHOOK_URL || "https://kotlin-web-api.businesschat.io/webhook/18613/automations/23112";
    
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const responseText = await webhookResponse.text();
    console.log(`[Resend] BusinessChat Response Status: ${webhookResponse.status}`);
    console.log(`[Resend] BusinessChat Response Body: ${responseText}`);

    if (!webhookResponse.ok) {
      return json({ 
        success: false, 
        error: `BusinessChat returned status ${webhookResponse.status}: ${responseText}` 
      }, { status: 502 });
    }

    return json({ 
      success: true, 
      message: `Message resent to ${log.customerPhone}` 
    });

  } catch (err: any) {
    console.error("[Resend] Error:", err);
    return json({ error: err.message || "Internal server error" }, { status: 500 });
  }
};
