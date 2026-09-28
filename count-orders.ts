import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const shop = 'althenayanhoney.myshopify.com';
  const session = await prisma.session.findFirst({ where: { shop } });
  
  const startDate = new Date('2026-08-04T13:35:00.000Z');
  const endDate = new Date('2026-09-07T23:35:00.000Z');
  
  const response = await fetch(`https://${shop}/admin/api/2024-01/orders/count.json?created_at_min=${startDate.toISOString()}&created_at_max=${endDate.toISOString()}&status=any`, {
    headers: { 'X-Shopify-Access-Token': session?.accessToken || "" }
  });
  const data = await response.json();
  console.log("Total orders in timeframe:", data);
}
run();
