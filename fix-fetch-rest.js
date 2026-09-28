import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app.settings.tsx', 'utf-8');
  
  const restStart = file.indexOf('const response = await admin.rest.get({');
  const restEnd = file.indexOf('const data = await response.json();');
  
  if (restStart === -1 || restEnd === -1) {
    throw new Error("Could not find replacement bounds");
  }
  
  const manualFetchLogic = `
    const response = await fetch(\`https://\${shop}/admin/api/2024-01/orders.json?created_at_min=\${startDate.toISOString()}&created_at_max=\${endDate.toISOString()}&status=any&limit=250\`, {
      headers: {
        'X-Shopify-Access-Token': session.accessToken
      }
    });
    `;
    
  const newFile = file.substring(0, restStart) + manualFetchLogic + file.substring(restEnd);
  
  await fs.writeFile('app/routes/app.settings.tsx', newFile);
  console.log("Patched settings to use fetch!");
}
run();
