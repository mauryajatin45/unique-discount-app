export const ODOO_URL = process.env.ODOO_URL || "https://althenayan.odoo.com";
export const ODOO_DB = process.env.ODOO_DB || "althenayan-main-19257613";
export const ODOO_USER = process.env.ODOO_USER || "honey.makwt@gmail.com";
export const ODOO_PASS = process.env.ODOO_PASS || "Dawood@2025";

export async function odooAuthenticate(): Promise<string> {
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

  const setCookieHeader = response.headers.get("set-cookie") || "";
  const sessionMatch = setCookieHeader.match(/session_id=([^;]+)/);
  let sessionId = sessionMatch ? sessionMatch[1] : null;

  const data = await response.json();

  if (data?.error) {
    throw new Error(`Odoo auth failed: ${JSON.stringify(data.error)}`);
  }

  if (!sessionId && data?.result?.session_id) {
    sessionId = data.result.session_id;
  }
  
  if (!sessionId) {
    throw new Error("No session ID returned from Odoo.");
  }

  return sessionId;
}

export async function odooSearchOrder(sessionId: string, orderRef: string): Promise<any | null> {
  // First try to search by display_name or name
  let args = [["name", "=", orderRef]];
  
  // If it's purely numeric, maybe they passed the ID directly
  if (/^\d+$/.test(orderRef)) {
    args = [["id", "=", parseInt(orderRef, 10)]];
  }

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
        args: [args],
        kwargs: {
          fields: ["id", "name", "display_name", "partner_id", "partner_mobile", "partner_phone", "amount_total", "currency_id", "state", "create_date", "order_line"],
          limit: 1,
        },
      },
    }),
  });

  const data = await response.json();
  if (data?.error) throw new Error(`Odoo search_read failed: ${JSON.stringify(data.error)}`);
  
  return data?.result?.[0] || null;
}
