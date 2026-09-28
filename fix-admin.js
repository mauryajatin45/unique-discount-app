const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function run() {
  const users = await prisma.appUser.findMany();
  console.log("Current Users in DB:", users.length);
  
  if (users.length === 0) {
    console.log("No users found! This is why you couldn't log in.");
  } else {
    console.log("Found user:", users[0].email, "for shop:", users[0].shop);
    console.log("Updating password to exactly 'admin123' just in case...");
    
    const defaultPassword = await bcrypt.hash("admin123", 10);
    await prisma.appUser.update({
      where: { id: users[0].id },
      data: { password: defaultPassword, email: "admin" }
    });
    console.log("Admin password forcefully reset to: admin123");
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
