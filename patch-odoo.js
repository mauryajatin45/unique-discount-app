import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/api.odoo.tsx', 'utf-8');
  
  const oldCode = `    const orderData = {
      id: orderId,
      customer: {`;
  
  const newCode = `    const odooOrderName = body.name || body.display_name || body.reference || body.order_id || String(orderId);
    const orderData = {
      id: orderId,
      name: odooOrderName,
      customer: {`;
  
  if (file.includes(oldCode)) {
    await fs.writeFile('app/routes/api.odoo.tsx', file.replace(oldCode, newCode));
    console.log("Successfully patched api.odoo.tsx!");
  } else {
    console.log("Could not find the target code in api.odoo.tsx.");
  }
}
run();
