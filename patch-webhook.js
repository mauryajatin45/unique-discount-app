import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/queue.server.ts', 'utf-8');
  
  const oldCode = `        const webhookResponse = await fetch("https://kotlin-web-api.businesschat.io/webhook/18613/automations/23112", {`;
  
  const newCode = `        // Use dynamic webhook URL from .env, fallback to Store 1's original webhook URL
        const webhookUrl = process.env.BUSINESSCHAT_WEBHOOK_URL || "https://kotlin-web-api.businesschat.io/webhook/18613/automations/23112";
        const webhookResponse = await fetch(webhookUrl, {`;
  
  if (file.includes(oldCode)) {
    await fs.writeFile('app/queue.server.ts', file.replace(oldCode, newCode));
    console.log("Successfully patched BusinessChat webhook to use environment variables!");
  } else {
    console.log("Could not find the target code to replace.");
  }
}
run();
