import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app.settings.tsx', 'utf-8');
  
  const oldCode = `  let settings = await prisma.appSettings.findUnique({ where: { shop } });
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: { shop, isActive: false, logRetentionDays: 30 }
    });
  }`;
  
  const newCode = `  let settings = await prisma.appSettings.upsert({
    where: { shop },
    update: {},
    create: { shop, isActive: false, logRetentionDays: 30 }
  });`;
  
  if (file.includes(oldCode)) {
    await fs.writeFile('app/routes/app.settings.tsx', file.replace(oldCode, newCode));
    console.log("Successfully patched settings loader!");
  } else {
    console.log("Could not find the target code to replace.");
  }
}
run();
