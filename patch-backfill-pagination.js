import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app.settings.tsx', 'utf-8');
  
  const oldCode = `    const response = await fetch(\`https://\${shop}/admin/api/2024-01/orders.json?created_at_min=\${startDate.toISOString()}&created_at_max=\${endDate.toISOString()}&status=any&limit=250\`, {
      headers: {
        'X-Shopify-Access-Token': session.accessToken
      }
    });
    const data = await response.json();
    if (!data || !data.orders) {
       console.error("REST Error fetching orders");
       return json({ error: "Error fetching orders" }, { status: 500 });
    }
    
    const orders = data.orders;`;
    
  const newCode = `    let allOrders = [];
    let url = \`https://\${shop}/admin/api/2024-01/orders.json?created_at_min=\${startDate.toISOString()}&created_at_max=\${endDate.toISOString()}&status=any&limit=250\`;
    
    while (url) {
      const response = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': session.accessToken }
      });
      
      const data = await response.json();
      if (!data || !data.orders) {
         console.error("REST Error fetching orders");
         return json({ error: "Error fetching orders" }, { status: 500 });
      }
      
      allOrders = allOrders.concat(data.orders);
      
      // Check for pagination Link header
      const linkHeader = response.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const links = linkHeader.split(', ');
        const nextLink = links.find(link => link.includes('rel="next"'));
        if (nextLink) {
          const match = nextLink.match(/<(.*?)>/);
          url = match ? match[1] : null;
        } else {
          url = null;
        }
      } else {
        url = null;
      }
    }
    
    const orders = allOrders;`;
    
    if (file.includes(oldCode)) {
      const newFile = file.replace(oldCode, newCode);
      await fs.writeFile('app/routes/app.settings.tsx', newFile);
      console.log("Successfully patched pagination!");
    } else {
      console.log("Could not find the target code to replace.");
    }
}
run();
