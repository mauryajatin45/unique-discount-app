const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function migrateOrderNames() {
  console.log("============================================");
  console.log("  ORDER NAME MIGRATION SCRIPT");
  console.log("  Safe backfill for old log entries");
  console.log("============================================\n");

  // Get all offline sessions
  let sessions = await prisma.session.findMany({
    where: { 
      accessToken: { not: "" },
      isOnline: false // We only want background offline tokens
    },
  });

  const shopifyLogs = await prisma.log.findMany({
    where: {
      orderName: null,
      NOT: { orderId: { startsWith: "ODOO-" } },
    },
    orderBy: { id: "desc" },
  });

  console.log(`[INFO] Found ${shopifyLogs.length} Shopify log(s) with missing orderName.\n`);

  let updated = 0, failed = 0, skipped = 0;

  for (let i = 0; i < shopifyLogs.length; i++) {
    const log = shopifyLogs[i];
    const progress = `[${i + 1}/${shopifyLogs.length}]`;

    try {
      // Find the first available session for this shop
      const session = sessions.find(s => s.shop === log.shop);
      if (!session) {
        console.log(`${progress} SKIP  [db_id=${log.id}] orderId=${log.orderId} → No valid session found for ${log.shop}`);
        skipped++;
        continue;
      }

      if (i > 0) await sleep(1500);

      const apiUrl = `https://${log.shop}/admin/api/2024-01/orders/${log.orderId}.json?fields=id,name`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        console.log(`${progress} WARN  Token for ${log.shop} is expired/revoked. Removing it from memory and retrying...`);
        // Remove this bad session from our array so we try the next one
        sessions = sessions.filter(s => s.id !== session.id);
        i--; // Retry this same log on the next loop iteration
        continue;
      }
      
      if (response.status === 404) {
        console.log(`${progress} SKIP  [db_id=${log.id}] orderId=${log.orderId} → Not found (deleted in Shopify)`);
        skipped++;
        continue;
      }

      if (response.status === 429) {
        console.log(`${progress} WARN  Rate limited. Waiting 10s...`);
        await sleep(10000);
        i--; // Retry
        continue;
      }

      if (!response.ok) {
        console.log(`${progress} FAIL  [db_id=${log.id}] orderId=${log.orderId} → API status ${response.status}`);
        failed++;
        continue;
      }

      const data = await response.json();
      const orderName = data?.order?.name;

      if (orderName) {
        await prisma.log.update({
          where: { id: log.id },
          data: { orderName: orderName },
        });
        console.log(`${progress} OK    [db_id=${log.id}] orderId=${log.orderId} → ${orderName}`);
        updated++;
      } else {
        console.log(`${progress} SKIP  [db_id=${log.id}] orderId=${log.orderId} → No name returned`);
        skipped++;
      }
    } catch (err) {
      console.error(`${progress} ERROR [db_id=${log.id}] → ${err.message}`);
      failed++;
    }
  }

  console.log("\n============================================");
  console.log("  MIGRATION COMPLETE");
  console.log(`  Shopify Updated:    ${updated}`);
  console.log(`  Shopify Failed:     ${failed}`);
  console.log(`  Shopify Skipped:    ${skipped}`);
  console.log("============================================\n");
}

migrateOrderNames().catch(console.error).finally(() => prisma.$disconnect());
