import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app.settings.tsx', 'utf-8');
  
  const gqlStart = file.indexOf('const response = await admin.graphql(`');
  const gqlEnd = file.indexOf('const skippedSet = new Set(existingLogs.map(l => l.orderId));');
  
  if (gqlStart === -1 || gqlEnd === -1) {
    throw new Error("Could not find replacement bounds");
  }
  
  const restLogic = `
    const response = await admin.rest.get({
      path: 'orders.json',
      query: {
        created_at_min: startDate.toISOString(),
        created_at_max: endDate.toISOString(),
        status: 'any',
        limit: '250'
      }
    });
    
    const data = await response.json();
    if (!data || !data.orders) {
       console.error("REST Error fetching orders");
       return json({ error: "Error fetching orders" }, { status: 500 });
    }
    
    const orders = data.orders;
    const eligibleOrderIds = [];
    
    for (const order of orders) {
      let hasProduct = false;
      for (const lineItem of order.line_items) {
         if (String(lineItem.product_id) === String(productId)) {
            hasProduct = true;
            break;
         }
      }
      if (hasProduct) {
        eligibleOrderIds.push(String(order.id));
      }
    }
    
    // Check against Log table
    const existingLogs = await prisma.log.findMany({
      where: {
        shop,
        orderId: { in: eligibleOrderIds }
      },
      select: { orderId: true }
    });
    
    `;
    
  const newFile = file.substring(0, gqlStart) + restLogic + file.substring(gqlEnd);
  
  await fs.writeFile('app/routes/app.settings.tsx', newFile);
  console.log("Patched to use REST!");
}
run();
