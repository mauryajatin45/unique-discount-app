import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/queue.server.ts', 'utf-8');
  
  // Replace the worker parameter mapping
  let newFile = file.replace(
    'const { shop, orderId, orderData } = job.data;',
    'const { shop, orderId, orderData, isOdooOrder } = job.data;'
  );
  
  // Add Odoo bypass logic
  const checkBlock = `if (triggerMode === "SPECIFIC_PRODUCT") {
        const triggerProductIdStr = settings.triggerProductId;
        if (!triggerProductIdStr) {
          console.log(\`Specific product trigger selected but no trigger product configured for \${shop}. Skipping.\`);
          return;
        }
        const triggerProductIds = triggerProductIdStr.split(',');
        const hasTriggerProduct = lineItems.some(
          (item: any) => triggerProductIds.includes(\`gid://shopify/Product/\${item.product_id}\`)
        );
        if (!hasTriggerProduct) {
          console.log(\`Order \${orderId} does not contain trigger product. Skipping.\`);
          return;
        }
      }`;
      
  const modifiedCheckBlock = `if (triggerMode === "SPECIFIC_PRODUCT") {
        const triggerProductIdStr = settings.triggerProductId;
        if (!triggerProductIdStr) {
          console.log(\`Specific product trigger selected but no trigger product configured for \${shop}. Skipping.\`);
          return;
        }
        
        let hasTriggerProduct = false;
        
        if (isOdooOrder) {
          // For Odoo orders, we assume the webhook was triggered correctly by Odoo automation rules 
          // or we bypass the strict Shopify GraphQL ID check because Odoo doesn't use Shopify IDs.
          hasTriggerProduct = true;
          console.log(\`[Odoo] Bypassing Shopify specific product check for order \${orderId}\`);
        } else {
          const triggerProductIds = triggerProductIdStr.split(',');
          hasTriggerProduct = lineItems.some(
            (item: any) => triggerProductIds.includes(\`gid://shopify/Product/\${item.product_id}\`)
          );
        }
        
        if (!hasTriggerProduct) {
          console.log(\`Order \${orderId} does not contain trigger product. Skipping.\`);
          return;
        }
      }`;
      
  newFile = newFile.replace(checkBlock, modifiedCheckBlock);
  
  await fs.writeFile('app/queue.server.ts', newFile);
  console.log("Patched queue for Odoo bypass!");
}
run();
