const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function migratePhoneNumbers() {
  console.log("============================================");
  console.log("  PHONE NUMBER MIGRATION SCRIPT");
  console.log("  Backfill customerPhone for old log entries");
  console.log("============================================\n");

  // Get all offline sessions (valid API tokens)
  let sessions = await prisma.session.findMany({
    where: { accessToken: { not: "" }, isOnline: false },
  });

  // Find all Shopify logs missing customerPhone
  const shopifyLogs = await prisma.log.findMany({
    where: {
      customerPhone: null,
      NOT: { orderId: { startsWith: "ODOO-" } },
    },
    orderBy: { id: "desc" },
  });

  console.log(`[INFO] Found ${shopifyLogs.length} Shopify log(s) with missing phone number.\n`);

  let updated = 0, failed = 0, skipped = 0;

  for (let i = 0; i < shopifyLogs.length; i++) {
    const log = shopifyLogs[i];
    const progress = `[${i + 1}/${shopifyLogs.length}]`;

    try {
      const session = sessions.find(s => s.shop === log.shop);
      if (!session || !session.accessToken) {
        console.log(`${progress} SKIP  [db_id=${log.id}] → No session for ${log.shop}`);
        skipped++;
        continue;
      }

      if (i > 0) await sleep(1500);

      const apiUrl = `https://${log.shop}/admin/api/2024-01/orders/${log.orderId}.json?fields=id,customer,phone,billing_address,shipping_address`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        console.log(`${progress} WARN  Token expired for ${log.shop}. Removing from memory...`);
        sessions = sessions.filter(s => s.id !== session.id);
        i--;
        continue;
      }

      if (response.status === 404) {
        console.log(`${progress} SKIP  [db_id=${log.id}] orderId=${log.orderId} → Order not found`);
        skipped++;
        continue;
      }

      if (response.status === 429) {
        console.log(`${progress} WARN  Rate limited. Waiting 10s...`);
        await sleep(10000);
        i--;
        continue;
      }

      if (!response.ok) {
        console.log(`${progress} FAIL  [db_id=${log.id}] orderId=${log.orderId} → API status ${response.status}`);
        failed++;
        continue;
      }

      const data = await response.json();
      const order = data?.order;

      if (!order) {
        console.log(`${progress} SKIP  [db_id=${log.id}] orderId=${log.orderId} → No order data`);
        skipped++;
        continue;
      }

      // Extract phone from multiple possible locations (same logic as queue.server.ts)
      const phone = order.customer?.phone || order.phone || order.billing_address?.phone || order.shipping_address?.phone || null;

      if (phone) {
        await prisma.log.update({
          where: { id: log.id },
          data: { customerPhone: phone },
        });
        console.log(`${progress} OK    [db_id=${log.id}] ${log.orderName || log.orderId} → ${phone}`);
        updated++;
      } else {
        console.log(`${progress} SKIP  [db_id=${log.id}] ${log.orderName || log.orderId} → No phone on order`);
        skipped++;
      }
    } catch (err) {
      console.error(`${progress} ERROR [db_id=${log.id}] → ${err.message}`);
      failed++;
    }
  }

  console.log("\n============================================");
  console.log("  MIGRATION COMPLETE");
  console.log(`  Updated:    ${updated}`);
  console.log(`  Failed:     ${failed}`);
  console.log(`  Skipped:    ${skipped}`);
  console.log("============================================\n");
}

migratePhoneNumbers().catch(console.error).finally(() => prisma.$disconnect());
