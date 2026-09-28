import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/queue.server.ts', 'utf-8');
  
  const oldBlock = `if (isOdooOrder) {
          // For Odoo orders, we assume the webhook was triggered correctly by Odoo automation rules 
          // or we bypass the strict Shopify GraphQL ID check because Odoo doesn't use Shopify IDs.
          hasTriggerProduct = true;
          console.log(\`[Odoo] Bypassing Shopify specific product check for order \${orderId}\`);
        }`;
        
  const newBlock = `if (isOdooOrder) {
          if (settings.odooTriggerProductId && settings.odooTriggerProductId.trim() !== "") {
            const odooTriggerIds = settings.odooTriggerProductId.split(',').map(id => id.trim());
            // Check if any of the Odoo line items match the specified Odoo Product ID or SKU
            hasTriggerProduct = lineItems.some(
              (item: any) => odooTriggerIds.includes(String(item.product_id)) || odooTriggerIds.includes(String(item.sku)) || odooTriggerIds.includes(String(item.id))
            );
            console.log(\`[Odoo] Checked strict Odoo Product ID mapping for order \${orderId}. Match found: \${hasTriggerProduct}\`);
          } else {
            hasTriggerProduct = true;
            console.log(\`[Odoo] No Odoo trigger ID mapped in settings, allowing all Odoo webhooks to pass for order \${orderId}\`);
          }
        }`;
        
  const newFile = file.replace(oldBlock, newBlock);
  
  await fs.writeFile('app/queue.server.ts', newFile);
  console.log("Patched queue to support strict Odoo product mapping");
}
run();
