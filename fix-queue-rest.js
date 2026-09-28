import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/queue.server.ts', 'utf-8');
  
  const restStart = file.indexOf('const { admin } = await shopify.unauthenticated.admin(shop);', file.indexOf('backfillWorker'));
  const restEnd = file.indexOf('const orderData = await response.json();', restStart);
  
  if (restStart === -1 || restEnd === -1) {
    throw new Error("Could not find replacement bounds");
  }
  
  const manualFetchLogic = `
      const { session } = await shopify.unauthenticated.admin(shop);
      
      const response = await fetch(\`https://\${shop}/admin/api/2024-01/orders/\${orderId}.json\`, {
        headers: {
          'X-Shopify-Access-Token': session.accessToken
        }
      });
      `;
      
  const newFile = file.substring(0, restStart) + manualFetchLogic + file.substring(restEnd);
  
  await fs.writeFile('app/queue.server.ts', newFile);
  console.log("Patched queue to use fetch!");
}
run();
