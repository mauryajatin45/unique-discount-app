import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const shop = 'althenayanhoney.myshopify.com';
  const session = await prisma.session.findFirst({ where: { shop } });
  const settings = await prisma.appSettings.findUnique({ where: { shop } });

  const logs = await prisma.log.findMany({
    where: { shop, orderId: { startsWith: 'ODOO-' } }
  });

  const discountPercentageProduct = parseFloat(settings?.discountPercentageProduct?.toString() || "10.0") / 100;
  const discountPercentageStore = parseFloat(settings?.discountPercentageStore?.toString() || "15.0") / 100;

  for (const log of logs) {
    const codes = [log.productCode, log.storewideCode].filter(Boolean);

    for (const code of codes) {
      // Fetch the node
      const fetchResponse = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': session?.accessToken || "" },
        body: JSON.stringify({
          query: `query { codeDiscountNodeByCode(code: "${code}") { id codeDiscount { ... on DiscountCodeBasic { appliesOncePerCustomer } } } }`
        })
      });
      const fetchData = await fetchResponse.json();
      const nodeId = fetchData.data?.codeDiscountNodeByCode?.id;

      const isProductCode = code.startsWith('TARGET-');
      const percentage = isProductCode ? discountPercentageProduct : discountPercentageStore;
      const endsAt = new Date();
      endsAt.setMonth(endsAt.getMonth() + 6);
      const items = isProductCode ? { products: { productsToAdd: settings?.targetProductId?.split(',') } } : { all: true };

      if (nodeId) {
        // UPDATE IN PLACE
        console.log(`Node exists for ${code}. Updating...`);
        const updateResponse = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': session?.accessToken || "" },
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
              basicCodeDiscount: { appliesOncePerCustomer: false }
            }
          })
        });
        const updateData = await updateResponse.json();
        const errors = updateData.data?.discountCodeBasicUpdate?.userErrors;
        if (errors?.length) console.error(`Error updating ${code}:`, errors);
        else console.log(`Successfully updated ${code}`);
      } else {
        // RECREATE
        console.log(`Node missing for ${code}. Recreating...`);
        const createResponse = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': session?.accessToken || "" },
          body: JSON.stringify({
            query: `
              mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
                discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
                  codeDiscountNode { id }
                  userErrors { message }
                }
              }
            `,
            variables: {
              basicCodeDiscount: {
                title: `${isProductCode ? 'Specific Product Discount' : 'Storewide Discount'} - ${log.orderId} (Fixed)`,
                code: code,
                startsAt: new Date().toISOString(),
                endsAt: endsAt.toISOString(),
                customerSelection: { all: true },
                customerGets: { value: { percentage }, items },
                usageLimit: 1
              }
            }
          })
        });
        const createData = await createResponse.json();
        const errors = createData.data?.discountCodeBasicCreate?.userErrors;
        if (errors?.length) console.error(`Error recreating ${code}:`, errors);
        else console.log(`Successfully recreated ${code}`);
      }
    }
  }
}

run().catch(console.error);
