import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('prisma/schema.prisma', 'utf-8');
  
  if (file.includes('orderName String?')) {
    console.log("Column already exists.");
    return;
  }

  const oldCode = `  orderId         String
  customerName    String?`;
  
  const newCode = `  orderId         String
  orderName       String?
  customerName    String?`;
  
  if (file.includes(oldCode)) {
    await fs.writeFile('prisma/schema.prisma', file.replace(oldCode, newCode));
    console.log("Successfully added orderName to schema!");
  } else {
    console.log("Could not find the target code to replace.");
  }
}
run();
