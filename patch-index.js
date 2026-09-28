import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app._index.tsx', 'utf-8');
  
  let newFile = file.replace(
    '<th>Order ID</th>',
    '<th>Source</th>\n                <th>Order ID</th>'
  );
  
  newFile = newFile.replace(
    '<td>#{log.orderId}</td>',
    `<td>
                      {log.orderId.startsWith('ODOO-') ? (
                        <span className="badge" style={{ backgroundColor: '#e9d5ff', color: '#7e22ce' }}>Odoo</span>
                      ) : (
                        <span className="badge" style={{ backgroundColor: '#dcfce3', color: '#166534' }}>Shopify</span>
                      )}
                    </td>
                    <td>#{log.orderId.replace('ODOO-', '')}</td>`
  );
  
  newFile = newFile.replace('colSpan={5}', 'colSpan={6}');
  
  // Also fix the active jobs section!
  newFile = newFile.replace(
    'Order #{job.orderId}',
    '{job.orderId.startsWith("ODOO-") ? "Odoo #" : "Shopify #"}{job.orderId.replace("ODOO-", "")}'
  );
  
  await fs.writeFile('app/routes/app._index.tsx', newFile);
  console.log("Patched app._index.tsx");
}
run();
