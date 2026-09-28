import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app.logs.tsx', 'utf-8');
  
  const oldCode = `<td style={{ fontWeight: 600, color: 'var(--app-primary)' }}>
                      #{log.orderId.replace('ODOO-', '')}
                    </td>`;
  
  const newCode = `<td style={{ fontWeight: 600, color: 'var(--app-primary)' }}>
                      {log.orderName || (log.orderId.startsWith('ODOO-') ? '#' + log.orderId.replace('ODOO-', '') : '#' + log.orderId)}
                    </td>`;
  
  if (file.includes(oldCode)) {
    await fs.writeFile('app/routes/app.logs.tsx', file.replace(oldCode, newCode));
    console.log("Successfully patched app.logs.tsx!");
  } else {
    console.log("Could not find the target code in app.logs.tsx.");
  }
}
run();
