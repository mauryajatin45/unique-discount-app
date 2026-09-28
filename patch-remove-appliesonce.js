import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/queue.server.ts', 'utf-8');
  let newFile = file.replace(/appliesOncePerCustomer:\s*true,/g, '');
  await fs.writeFile('app/queue.server.ts', newFile);
  console.log("Removed appliesOncePerCustomer");
}
run();
