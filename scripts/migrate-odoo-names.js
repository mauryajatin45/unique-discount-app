const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function migrateOdooNames() {
  console.log("============================================");
  console.log("  ODOO NAME MIGRATION SCRIPT");
  console.log("  Safe backfill for old Odoo log entries");
  console.log("============================================\n");

  const ODOO_URL = process.env.ODOO_URL;
  const ODOO_DB = process.env.ODOO_DB;
  const ODOO_USER = process.env.ODOO_USER;
  const ODOO_PASS = process.env.ODOO_PASS;

  if (!ODOO_URL || !ODOO_DB || !ODOO_USER || !ODOO_PASS) {
    console.error("FATAL: Missing Odoo credentials.");
    console.error("Please run the command with ODOO_URL, ODOO_DB, ODOO_USER, and ODOO_PASS env variables.");
    return;
  }

  const odooLogs = await prisma.log.findMany({
    where: {
      orderName: null,
      orderId: { startsWith: "ODOO-" }
    },
    orderBy: { id: "desc" },
  });

  console.log(`[INFO] Found ${odooLogs.length} Odoo log(s) with missing orderName.\n`);

  if (odooLogs.length === 0) return;

  const odooIds = odooLogs
    .map(log => {
      const numMatch = log.orderId.match(/\d+/);
      return numMatch ? parseInt(numMatch[0]) : null;
    })
    .filter(id => id !== null);

  if (odooIds.length === 0) return;

  console.log(`[INFO] Authenticating with Odoo at ${ODOO_URL}...`);
  
  const authResponse = await fetch(`${ODOO_URL}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      params: { db: ODOO_DB, login: ODOO_USER, password: ODOO_PASS }
    })
  });

  const authData = await authResponse.json();
  if (authData.error || !authData.result) {
    console.error("FATAL: Failed to authenticate with Odoo.");
    console.error(authData.error || "Unknown error");
    return;
  }

  // Extract session cookie (Odoo 15+ sends it ONLY in headers, not in JSON)
  const cookies = authResponse.headers.get("set-cookie") || "";
  let sessionId = authData.result.session_id || "";
  const sessionMatch = cookies.match(/session_id=([^;]+)/);
  if (sessionMatch) {
    sessionId = sessionMatch[1];
  }

  if (!sessionId) {
    console.error("FATAL: Authenticated successfully, but no session_id cookie found.");
    return;
  }

  console.log("[INFO] Successfully authenticated with Odoo.\n");

  let updated = 0, failed = 0, skipped = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < odooIds.length; i += BATCH_SIZE) {
    const batchIds = odooIds.slice(i, i + BATCH_SIZE);
    console.log(`[INFO] Fetching batch of ${batchIds.length} orders from Odoo...`);

    try {
      const searchResponse = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": `session_id=${sessionId}`
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            model: "sale.order",
            method: "search_read",
            args: [[["id", "in", batchIds]]],
            kwargs: { fields: ["id", "name", "display_name"] }
          }
        })
      });

      const searchData = await searchResponse.json();
      
      if (searchData.error) {
        console.error("[ERROR] Odoo query failed:", searchData.error);
        failed += batchIds.length;
        continue;
      }

      const orders = searchData.result || [];
      
      for (const order of orders) {
        const orderIdStr = `ODOO-${order.id}`;
        const nameToSave = order.display_name || order.name;

        if (!nameToSave) { skipped++; continue; }

        const log = odooLogs.find(l => l.orderId === orderIdStr);
        if (log) {
          await prisma.log.update({
            where: { id: log.id },
            data: { orderName: nameToSave }
          });
          console.log(`  OK    [db_id=${log.id}] ${orderIdStr} → ${nameToSave}`);
          updated++;
        }
      }

      const returnedIds = orders.map(o => o.id);
      const missingIds = batchIds.filter(id => !returnedIds.includes(id));
      for (const missing of missingIds) {
        console.log(`  SKIP  ODOO-${missing} → Not found in Odoo (may be deleted)`);
        skipped++;
      }

      await sleep(500);
    } catch (err) {
      console.error("[ERROR] Network failure during batch:", err.message);
      failed += batchIds.length;
    }
  }

  console.log("\n============================================");
  console.log("  MIGRATION COMPLETE");
  console.log(`  Odoo Updated:    ${updated}`);
  console.log(`  Odoo Failed:     ${failed}`);
  console.log(`  Odoo Skipped:    ${skipped}`);
  console.log("============================================\n");
}

migrateOdooNames().catch(console.error).finally(() => prisma.$disconnect());
