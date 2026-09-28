import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/api.odoo.tsx', 'utf-8');
  const injectCode = `
    const displayName = body.display_name || body.name || "";
    if (displayName.toUpperCase().includes("SHOPIFY")) {
      console.log(\`[Odoo Webhook] Rejected payload because it is a Shopify-synced order: \${displayName}\`);
      return json({ success: true, message: "Ignored Shopify-synced order" });
    }
  `;
  const newFile = file.replace(
    'const orderId = body.order_id || body.name || body.id || `ODOO-${Date.now()}`;',
    injectCode + '\n    const orderId = body.order_id || body.name || body.id || `ODOO-${Date.now()}`;'
  );
  await fs.writeFile('app/routes/api.odoo.tsx', newFile);
  console.log("Patched api.odoo.tsx for extra protection");
}
run();
