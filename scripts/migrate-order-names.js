/**
 * migrate-order-names.js
 * 
 * SAFE migration script to backfill the `orderName` column for old Log entries.
 * 
 * SAFETY GUARANTEES:
 * - NEVER modifies `orderId` (that's our rollback/safety column)
 * - Only updates records where `orderName` IS NULL (idempotent - safe to run multiple times)
 * - 1.5 second delay between Shopify API calls (well under the 2/sec rate limit)
 * - Every action is logged to console
 * - If any single lookup fails, it skips that record and continues
 * - Odoo orders are skipped (we don't have Odoo API credentials)
 * 
 * HOW TO RUN (inside Docker container):
 *   docker compose exec app node scripts/migrate-order-names.js
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Helper: sleep for ms milliseconds
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function migrateOrderNames() {
  console.log("============================================");
  console.log("  ORDER NAME MIGRATION SCRIPT");
  console.log("  Safe backfill for old log entries");
  console.log("============================================\n");

  // ─── Step 1: Get Shopify session for API access ───
  let sessions;
  try {
    sessions = await prisma.session.findMany({
      where: {
        accessToken: { not: "" },
      },
    });
  } catch (err) {
    console.error("FATAL: Could not query Session table:", err.message);
    return;
  }

  if (!sessions || sessions.length === 0) {
    console.error("FATAL: No Shopify sessions found in database. Cannot access Shopify API.");
    console.error("       Please open the app in Shopify Admin first to create a session.");
    return;
  }

  // Use the first valid session
  const session = sessions[0];
  const shop = session.shop;
  const accessToken = session.accessToken;

  console.log(`[INFO] Using shop: ${shop}`);
  console.log(`[INFO] Access token found: ${accessToken ? "YES (length=" + accessToken.length + ")" : "NO"}\n`);

  if (!accessToken) {
    console.error("FATAL: Access token is empty. Cannot proceed.");
    return;
  }

  // ─── Step 2: Find all Shopify logs that need updating ───
  let shopifyLogs;
  try {
    shopifyLogs = await prisma.log.findMany({
      where: {
        orderName: null,
        NOT: {
          orderId: { startsWith: "ODOO-" },
        },
      },
      orderBy: { id: "asc" },
    });
  } catch (err) {
    console.error("FATAL: Could not query Log table:", err.message);
    return;
  }

  console.log(`[INFO] Found ${shopifyLogs.length} Shopify log(s) with missing orderName.\n`);

  // ─── Step 3: Process each Shopify log ───
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < shopifyLogs.length; i++) {
    const log = shopifyLogs[i];
    const progress = `[${i + 1}/${shopifyLogs.length}]`;

    try {
      // Respect Shopify rate limits: 1.5 second between requests
      if (i > 0) {
        await sleep(1500);
      }

      // Call Shopify REST Admin API to get the order name
      const apiUrl = `https://${shop}/admin/api/2024-01/orders/${log.orderId}.json?fields=id,name`;

      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      // Check rate limit headers
      const remaining = response.headers.get("x-shopify-shop-api-call-limit");
      if (remaining) {
        console.log(`${progress} Rate limit status: ${remaining}`);
      }

      if (response.status === 404) {
        console.log(`${progress} SKIP  [db_id=${log.id}] orderId=${log.orderId} → Order not found in Shopify (may be deleted/archived)`);
        skipped++;
        continue;
      }

      if (response.status === 429) {
        // Rate limited! Wait 10 seconds and retry once
        console.log(`${progress} WARN  Rate limited by Shopify. Waiting 10 seconds...`);
        await sleep(10000);

        const retryResponse = await fetch(apiUrl, {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        });

        if (!retryResponse.ok) {
          console.log(`${progress} FAIL  [db_id=${log.id}] orderId=${log.orderId} → Still rate limited after retry (status ${retryResponse.status})`);
          failed++;
          continue;
        }

        const retryData = await retryResponse.json();
        const retryName = retryData?.order?.name;
        if (retryName) {
          await prisma.log.update({
            where: { id: log.id },
            data: { orderName: retryName },
          });
          console.log(`${progress} OK    [db_id=${log.id}] orderId=${log.orderId} → orderName=${retryName} (after retry)`);
          updated++;
        } else {
          console.log(`${progress} SKIP  [db_id=${log.id}] orderId=${log.orderId} → No name in retry response`);
          skipped++;
        }
        continue;
      }

      if (!response.ok) {
        console.log(`${progress} FAIL  [db_id=${log.id}] orderId=${log.orderId} → API returned status ${response.status}`);
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
        console.log(`${progress} OK    [db_id=${log.id}] orderId=${log.orderId} → orderName=${orderName}`);
        updated++;
      } else {
        console.log(`${progress} SKIP  [db_id=${log.id}] orderId=${log.orderId} → API returned OK but no 'name' field in response`);
        skipped++;
      }
    } catch (err) {
      console.error(`${progress} ERROR [db_id=${log.id}] orderId=${log.orderId} → ${err.message}`);
      failed++;
    }
  }

  // ─── Step 4: Report on Odoo logs ───
  let odooLogs;
  try {
    odooLogs = await prisma.log.findMany({
      where: {
        orderName: null,
        orderId: { startsWith: "ODOO-" },
      },
      orderBy: { id: "asc" },
    });
  } catch (err) {
    console.error("\n[WARN] Could not query Odoo logs:", err.message);
    odooLogs = [];
  }

  if (odooLogs.length > 0) {
    console.log(`\n[INFO] Found ${odooLogs.length} Odoo log(s) that cannot be auto-backfilled.`);
    console.log("[INFO] Odoo orders require Odoo API access to fetch the SK number.");
    console.log("[INFO] These will continue showing ODOO-{id} format. New orders will be correct.\n");
    for (const log of odooLogs) {
      console.log(`  → [db_id=${log.id}] orderId=${log.orderId} customer=${log.customerName || "N/A"}`);
    }
  }

  // ─── Step 5: Final Summary ───
  console.log("\n============================================");
  console.log("  MIGRATION COMPLETE");
  console.log("============================================");
  console.log(`  Shopify Updated:    ${updated}`);
  console.log(`  Shopify Failed:     ${failed}`);
  console.log(`  Shopify Skipped:    ${skipped}`);
  console.log(`  Odoo (manual):      ${odooLogs.length}`);
  console.log(`  Total processed:    ${shopifyLogs.length + odooLogs.length}`);
  console.log("============================================");
  console.log("\nSafety note: orderId was NEVER modified. If anything looks wrong,");
  console.log("you can reset by running: UPDATE Log SET orderName = NULL;");
  console.log("============================================\n");
}

// Run the migration
migrateOrderNames()
  .catch((err) => {
    console.error("\nFATAL UNHANDLED ERROR:", err);
  })
  .finally(() => {
    prisma.$disconnect();
  });
