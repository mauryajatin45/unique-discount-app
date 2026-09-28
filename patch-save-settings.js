import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app.settings.tsx', 'utf-8');
  
  let newFile = file.replace(
    'isActive: isActive.toString(),',
    'isActive: isActive.toString(),\n        isOdooActive: isOdooActive.toString(),\n        odooTriggerProductId: odooTriggerProductId || "",'
  );
  
  await fs.writeFile('app/routes/app.settings.tsx', newFile);
  console.log("Patched save_settings");
}
run();
