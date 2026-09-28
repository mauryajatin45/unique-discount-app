import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/queue.server.ts', 'utf-8');
  
  let newFile = file.replace(
    'if (!settings || !settings.isActive) {\n        console.log(`Offer not active for shop ${shop}. Skipping.`);\n        return;\n      }',
    `if (!settings || !settings.isActive) {
        console.log(\`Offer not active for shop \${shop}. Skipping.\`);
        return;
      }
      
      if (isOdooOrder && !settings.isOdooActive) {
        console.log(\`Odoo integration is paused for shop \${shop}. Skipping Odoo order \${orderId}.\`);
        return;
      }`
  );
  
  await fs.writeFile('app/queue.server.ts', newFile);
  console.log("Patched queue to check isOdooActive");
}
run();
