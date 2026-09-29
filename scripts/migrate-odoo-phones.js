const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ODOO_URL = process.env.ODOO_URL || "https://althenayan.odoo.com";
const ODOO_DB = process.env.ODOO_DB || "althenayan-main-19257613";
const ODOO_USER = process.env.ODOO_USER || "honey.makwt@gmail.com";
const ODOO_PASS = process.env.ODOO_PASS || "Dawood@2025";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function odooAuthenticate() {
  console.log(`[INFO] Authenticating with Odoo at ${ODOO_URL}...`);

  const response = await fetch(`${ODOO_URL}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: 1,
      params: { db: ODOO_DB, login: ODOO_USER, password: ODOO_PASS },
    }),
  });

  // Odoo 18 returns session_id in Set-Cookie header, not JSON body
  const setCookieHeader = response.headers.get("set-cookie") || "";
  const sessionMatch = setCookieHeader.match(/session_id=([^;]+)/);
  const sessionId = sessionMatch ? sessionMatch[1] : null;

  const data = await response.json();

  if (data?.error) {
    throw new Error(`Odoo auth failed: ${JSON.stringify(data.error)}`);
  }

  if (!sessionId && !data?.result?.session_id) {
    throw new Error("No session ID returned from Odoo.");
  }

  const sid = sessionId || data.result.session_id;
  console.log(`[INFO] Odoo authenticated successfully.\n`);
  return sid;
}

async function odooSearchRead(sessionId, ids) {
  const response = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: 2,
      params: {
        model: "sale.order",
        method: "search_read",
        args: [[["id", "in", ids]]],
        kwargs: {
          fields: ["id", "name", "partner_id", "partner_mobile", "partner_phone"],
          limit: ids.length,
        },
      },
    }),
  });

  const data = await response.json();
  if (data?.error) throw new Error(`Odoo search_read failed: ${JSON.stringify(data.error)}`);
  return data?.result || [];
}

async function migrateOdooPhoneNumbers() {
  console.log("============================================");
  console.log("  ODOO PHONE NUMBER MIGRATION SCRIPT");
  console.log("  Backfill customerPhone for old Odoo logs");
  console.log("============================================\n");

  // Find all Odoo logs missing customerPhone
  const odooLogs = await prisma.log.findMany({
    where: {
      customerPhone: null,
      orderId: { startsWith: "ODOO-" },
    },
    orderBy: { id: "desc" },
  });

  console.log(`[INFO] Found ${odooLogs.length} Odoo log(s) with missing phone number.\n`);

  if (odooLogs.length === 0) {
    console.log("[INFO] Nothing to do.\n");
    return;
  }

  // Authenticate with Odoo
  let sessionId;
  try {
    sessionId = await odooAuthenticate();
  } catch (err) {
    console.error(`[FATAL] ${err.message}`);
    return;
  }

  let updated = 0, failed = 0, skipped = 0;
  const BATCH_SIZE = 50;

  for (let offset = 0; offset < odooLogs.length; offset += BATCH_SIZE) {
    const batch = odooLogs.slice(offset, offset + BATCH_SIZE);

    // Extract numeric Odoo IDs from "ODOO-141614" format
    const odooIds = batch.map(log => parseInt(log.orderId.replace("ODOO-", ""), 10)).filter(id => !isNaN(id));

    if (odooIds.length === 0) {
      for (const log of batch) {
        console.log(`[SKIP] [db_id=${log.id}] orderId=${log.orderId} → Could not parse Odoo ID`);
        skipped++;
      }
      continue;
    }

    let orders = [];
    try {
      orders = await odooSearchRead(sessionId, odooIds);
      await sleep(500); // gentle rate limiting
    } catch (err) {
      console.error(`[ERROR] Batch fetch failed: ${err.message}`);
      for (const log of batch) {
        console.log(`[${offset + batch.indexOf(log) + 1}/${odooLogs.length}] FAIL  [db_id=${log.id}] → ${err.message}`);
        failed++;
      }
      continue;
    }

    // Build a map: odoo_id → phone
    const phoneMap = {};
    for (const order of orders) {
      const phone = order.partner_mobile || order.partner_phone || null;
      phoneMap[order.id] = phone;
    }

    // Update each log
    for (const log of batch) {
      const logIndex = offset + batch.indexOf(log) + 1;
      const progress = `[${logIndex}/${odooLogs.length}]`;
      const odooId = parseInt(log.orderId.replace("ODOO-", ""), 10);
      const phone = phoneMap[odooId] || null;

      if (phone) {
        try {
          await prisma.log.update({
            where: { id: log.id },
            data: { customerPhone: phone },
          });
          console.log(`${progress} OK    [db_id=${log.id}] ${log.orderName || log.orderId} → ${phone}`);
          updated++;
        } catch (err) {
          console.error(`${progress} ERROR [db_id=${log.id}] DB update failed: ${err.message}`);
          failed++;
        }
      } else if (!phoneMap.hasOwnProperty(odooId)) {
        console.log(`${progress} SKIP  [db_id=${log.id}] ${log.orderName || log.orderId} → Order not found in Odoo`);
        skipped++;
      } else {
        console.log(`${progress} SKIP  [db_id=${log.id}] ${log.orderName || log.orderId} → No phone on Odoo order`);
        skipped++;
      }
    }
  }

  console.log("\n============================================");
  console.log("  MIGRATION COMPLETE");
  console.log(`  Updated:    ${updated}`);
  console.log(`  Failed:     ${failed}`);
  console.log(`  Skipped:    ${skipped}`);
  console.log("============================================\n");
}

migrateOdooPhoneNumbers().catch(console.error).finally(() => prisma.$disconnect());
