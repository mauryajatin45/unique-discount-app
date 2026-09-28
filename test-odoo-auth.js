const ODOO_URL = "https://althenayan.odoo.com";
const ODOO_DB = "althenayan-main-19257613";
const ODOO_USER = "honey.makwt@gmail.com";
const ODOO_PASS = "Dawood@2025";

async function test() {
  const authResponse = await fetch(`${ODOO_URL}/web/session/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      params: {
        db: ODOO_DB,
        login: ODOO_USER,
        password: ODOO_PASS
      }
    })
  });
  const text = await authResponse.text();
  console.log("Raw Response:");
  console.log(text);
}
test();
