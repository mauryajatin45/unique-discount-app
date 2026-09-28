import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/queue.server.ts', 'utf-8');
  
  const oldCode = `        data: {
          shop,
          orderId: String(orderId),
          customerName,`;
  
  const newCode = `        data: {
          shop,
          orderId: String(orderId),
          orderName: orderData.name || String(orderId),
          customerName,`;
  
  if (file.includes(oldCode)) {
    await fs.writeFile('app/queue.server.ts', file.replace(oldCode, newCode));
    console.log("Successfully patched queue.server.ts!");
  } else {
    console.log("Could not find the target code in queue.server.ts.");
  }
}
run();
