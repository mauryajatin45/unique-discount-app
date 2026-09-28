import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const settings = await prisma.appSettings.findFirst({
    where: { shop: "althenayanhoney.myshopify.com" }
  });
  console.log(settings);
}
run();
