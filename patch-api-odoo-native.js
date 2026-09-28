import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/api.odoo.tsx', 'utf-8');
  
  // 1. Support api_key in URL query param
  let newFile = file.replace(
    'const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization");',
    `const url = new URL(request.url);
  const apiKey = request.headers.get("x-api-key") || request.headers.get("authorization") || url.searchParams.get("api_key");`
  );
  
  // 2. Make payload parsing hyper-resilient for Odoo's native webhook format
  const parsingBlock = `const orderId = body.order_id || body.id || \`ODOO-\${Date.now()}\`;
    const customerName = body.customer_name || body.partner_name || "Customer";
    const customerPhone = body.customer_phone || body.partner_phone || body.phone || "";`;
    
  const newParsingBlock = `// Extract Order ID (Odoo native webhook sends "name" for the SO reference)
    const orderId = body.order_id || body.name || body.id || \`ODOO-\${Date.now()}\`;
    
    // Extract Customer Name (Odoo native sends partner_id as [ID, "Name"])
    let customerName = "Customer";
    if (body.customer_name) customerName = body.customer_name;
    else if (body.partner_name) customerName = body.partner_name;
    else if (Array.isArray(body.partner_id) && body.partner_id.length > 1) customerName = body.partner_id[1];
    
    // Extract Customer Phone (Search through all keys for something containing 'phone' or 'mobile')
    let customerPhone = body.customer_phone || body.partner_phone || body.phone || "";
    if (!customerPhone) {
      for (const [key, value] of Object.entries(body)) {
        if ((key.toLowerCase().includes('phone') || key.toLowerCase().includes('mobile')) && typeof value === 'string') {
          customerPhone = value;
          break;
        }
      }
    }
    
    console.log(\`[Odoo Webhook Raw Payload] \`, JSON.stringify(body));`;
    
  newFile = newFile.replace(parsingBlock, newParsingBlock);
  
  await fs.writeFile('app/routes/api.odoo.tsx', newFile);
  console.log("Patched api.odoo.tsx for native webhooks");
}
run();
