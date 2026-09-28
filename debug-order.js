import prisma from './app/db.server.js';
import shopify from './app/shopify.server.js';

async function main() {
  const shop = "althenayanhoney.myshopify.com";
  
  const settings = await prisma.appSettings.findUnique({ where: { shop } });
  console.log("DB SETTINGS Trigger:", settings.triggerProductId);
  
  const { session } = await shopify.unauthenticated.admin(shop);
  
  const response = await fetch(`https://${shop}/admin/api/2024-01/orders/7112074559744.json`, {
    headers: { 'X-Shopify-Access-Token': session.accessToken }
  });
  
  const data = await response.json();
  
  if (data.order) {
    console.log("ORDER LINE ITEMS:");
    data.order.line_items.forEach(item => {
      console.log(`- Product ID: ${item.product_id} (${item.title})`);
      const gid = `gid://shopify/Product/${item.product_id}`;
      console.log(`  GID: ${gid}`);
      console.log(`  Matches Settings?`, settings.triggerProductId.includes(gid));
    });
  } else {
    console.log("Order not found or error:", data);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
