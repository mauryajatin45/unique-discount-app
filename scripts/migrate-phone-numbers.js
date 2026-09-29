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

  // Get ALL sessions — offline preferred, but fall back to non-expired online sessions
  const allSessions = await prisma.session.findMany({
    where: { accessToken: { not: "" } },
  });

  // Group by shop: prefer offline sessions, fall back to most-recently-expiring online ones
  const sessionsByShop = {};
  for (const s of allSessions) {
    if (!sessionsByShop[s.shop]) sessionsByShop[s.shop] = [];
    sessionsByShop[s.shop].push(s);
  }

  // For each shop, sort: offline first, then online by expiresAt desc (most recent first)
  const now = new Date();
  for (const shop of Object.keys(sessionsByShop)) {
    sessionsByShop[shop].sort((a, b) => {
      if (!a.isOnline && b.isOnline) return -1;
      if (a.isOnline && !b.isOnline) return 1;
      // both same type — sort by expiresAt desc (nulls last)
      if (!a.expiresAt && !b.expiresAt) return 0;
      if (!a.expiresAt) return -1;
      if (!b.expiresAt) return 1;
      return new Date(b.expiresAt) - new Date(a.expiresAt);
    });
    // Remove expired online sessions upfront
    sessionsByShop[shop] = sessionsByShop[shop].filter(s => {
      if (s.isOnline && s.expiresAt && new Date(s.expiresAt) < now) return false;
      return true;
    });
  }

  const getSession = (shop) => (sessionsByShop[shop] || [])[0] || null;
  const removeSession = (shop, id) => {
    if (sessionsByShop[shop]) {
      sessionsByShop[shop] = sessionsByShop[shop].filter(s => s.id !== id);
    }
  };

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
      const session = getSession(log.shop);
      if (!session) {
        console.log(`${progress} SKIP  [db_id=${log.id}] → No valid session for ${log.shop}`);
        skipped++;
        continue;
      }

      if (i > 0) await sleep(300);

      const apiUrl = `https://${log.shop}/admin/api/2024-01/orders/${log.orderId}.json?fields=id,customer,phone,billing_address,shipping_address`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": session.accessToken,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        console.log(`${progress} WARN  Token invalid for ${log.shop} (session: ${session.id.substring(0, 20)}...). Trying next session...`);
        removeSession(log.shop, session.id);
        i--; // retry same log with next session
        continue;
      }

      if (response.status === 404) {
        console.log(`${progress} SKIP  [db_id=${log.id}] orderId=${log.orderId} → Order not found (deleted)`);
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

      const phone =
        order.customer?.phone ||
        order.phone ||
        order.billing_address?.phone ||
        order.shipping_address?.phone ||
        null;

      if (phone) {
        await prisma.log.update({
          where: { id: log.id },
          data: { customerPhone: phone },
        });
        console.log(`${progress} OK    [db_id=${log.id}] ${log.orderName || log.orderId} → ${phone}`);
        updated++;
      } else {
        console.log(`${progress} SKIP  [db_id=${log.id}] ${log.orderName || log.orderId} → No phone on Shopify order`);
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
