import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/queue.server.ts', 'utf-8');
  let newFile = file.replace(/customerSelection: orderData\.customer\?\.id \? \{/g, `
            ...(orderData.customer?.id ? { appliesOncePerCustomer: true } : {}),
            customerSelection: orderData.customer?.id ? {`);
  await fs.writeFile('app/queue.server.ts', newFile);
  console.log("Patched queue to add appliesOncePerCustomer for Shopify orders only");
}
run();
