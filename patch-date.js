import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app.logs.tsx', 'utf-8');
  
  const oldCode = `{new Date(log.createdAt).toLocaleString()}`;
  const newCode = `{log.createdAt.replace('T', ' ').substring(0, 19)}`;
  
  if (file.includes(oldCode)) {
    await fs.writeFile('app/routes/app.logs.tsx', file.replace(oldCode, newCode));
    console.log("Successfully patched date rendering!");
  } else {
    console.log("Could not find the target code in app.logs.tsx.");
  }
}
run();
