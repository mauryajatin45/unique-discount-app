import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const shop = 'althenayanhoney.myshopify.com';
  const session = await prisma.session.findFirst({ where: { shop } });
  
  const code = 'TARGET-SZRYTS';
  
  const response = await fetch(`https://${shop}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': session.accessToken
    },
    body: JSON.stringify({
      query: `
        query {
          codeDiscountNodeByCode(code: "${code}") {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                status
                customerSelection {
                  ... on DiscountCustomerAll {
                    allCustomers
                  }
                  ... on DiscountCustomers {
                    customers {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      `
    })
  });
  
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

check().catch(console.error);
