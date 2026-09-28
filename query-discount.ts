import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const shop = 'althenayanhoney.myshopify.com';
  const session = await prisma.session.findFirst({ where: { shop } });
  
  const code = 'TARGET-SZRYTS'; // Let's check this specific code from their screenshot

  const fetchResponse = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': session?.accessToken || "" },
    body: JSON.stringify({
      query: `query { 
        codeDiscountNodeByCode(code: "${code}") { 
          id 
          codeDiscount { 
            ... on DiscountCodeBasic { 
              status
              appliesOncePerCustomer 
              customerSelection {
                ... on DiscountCustomerAll { allCustomers }
              }
              title
            } 
          } 
        } 
      }`
    })
  });
  const data = await fetchResponse.json();
  console.log(JSON.stringify(data, null, 2));
}

run().catch(console.error);
