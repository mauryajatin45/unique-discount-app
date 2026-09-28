import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/queue.server.ts', 'utf-8');
  const newFile = file.replace(
    'if (isOdooOrder && !settings.isOdooActive) {',
    'if (isOdooOrder && settings.isOdooActive === false) {'
  );
  await fs.writeFile('app/queue.server.ts', newFile);
  console.log("Patched queue.server.ts");
}
run();
