import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const shop = 'althenayanhoney.myshopify.com';
  const session = await prisma.session.findFirst({ where: { shop } });

  const logs = await prisma.log.findMany({
    where: { shop, orderId: { startsWith: 'ODOO-' } }
  });

  for (const log of logs) {
    const codes = [log.productCode, log.storewideCode].filter(Boolean);

    for (const code of codes) {
      // Fetch the node
      const fetchResponse = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': session.accessToken },
        body: JSON.stringify({
          query: `query { codeDiscountNodeByCode(code: "${code}") { id codeDiscount { ... on DiscountCodeBasic { appliesOncePerCustomer } } } }`
        })
      });
      const fetchData = await fetchResponse.json();
      const nodeId = fetchData.data?.codeDiscountNodeByCode?.id;
      const currentlyAppliesOnce = fetchData.data?.codeDiscountNodeByCode?.codeDiscount?.appliesOncePerCustomer;

      if (nodeId) {
        if (currentlyAppliesOnce === false) {
           // Already fixed
           continue;
        }

        console.log(`Updating ${code}...`);
        const updateResponse = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': session.accessToken },
          body: JSON.stringify({
            query: `
              mutation discountCodeBasicUpdate($id: ID!, $basicCodeDiscount: DiscountCodeBasicInput!) {
                discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
                  userErrors { message }
                }
              }
            `,
            variables: {
              id: nodeId,
              basicCodeDiscount: {
                appliesOncePerCustomer: false
              }
            }
          })
        });

        const updateData = await updateResponse.json();
        const errors = updateData.data?.discountCodeBasicUpdate?.userErrors;
        if (errors && errors.length > 0) {
          console.error(`Error updating ${code}:`, errors);
        } else {
          console.log(`Successfully updated ${code} to remove appliesOncePerCustomer`);
        }
      } else {
         console.log(`Could not find ${code} in Shopify. Might be fully deleted or doesn't exist.`);
      }
    }
  }
}

run().catch(console.error);
