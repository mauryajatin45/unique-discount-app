import fs from 'fs/promises';

async function run() {
  let file = await fs.readFile('app/routes/app.settings.tsx', 'utf-8');
  
  // 1. Add to Action intent mapping
  file = file.replace(
    'const targetProductTitle = formData.get("targetProductTitle")?.toString();',
    'const targetProductTitle = formData.get("targetProductTitle")?.toString();\n    const odooTriggerProductId = formData.get("odooTriggerProductId")?.toString();'
  );
  
  file = file.replace(
    'isOdooActive, triggerMode, triggerProductId, triggerProductTitle, targetProductId, targetProductTitle, discountPercentageProduct, discountPercentageStore, logRetentionDays',
    'isOdooActive, odooTriggerProductId, triggerMode, triggerProductId, triggerProductTitle, targetProductId, targetProductTitle, discountPercentageProduct, discountPercentageStore, logRetentionDays'
  );
  
  // 2. Add to State
  file = file.replace(
    'const [isOdooActive, setIsOdooActive] = useState(settings.isOdooActive ?? true);',
    'const [isOdooActive, setIsOdooActive] = useState(settings.isOdooActive ?? true);\n  const [odooTriggerProductId, setOdooTriggerProductId] = useState(settings.odooTriggerProductId || "");'
  );
  
  // 3. Add to hidden inputs
  file = file.replace(
    '<input type="hidden" name="isOdooActive" value={isOdooActive.toString()} />',
    '<input type="hidden" name="isOdooActive" value={isOdooActive.toString()} />\n              <input type="hidden" name="odooTriggerProductId" value={odooTriggerProductId} />'
  );
  
  // 4. Add to UI
  const odooToggleHTML = `
            <div className="form-group" style={{ marginTop: '24px', background: isOdooActive ? '#faf5ff' : '#f8fafc', padding: '24px', borderRadius: '12px', border: \`1px solid \${isOdooActive ? '#d8b4fe' : '#e2e8f0'}\` }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#6b21a8' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                Odoo API Integration
              </h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--app-text-muted)', flex: 1 }}>Allow the system to automatically generate discounts for manual Odoo sales orders received via webhook.</p>
                <button type="button" className="btn-primary" style={{ background: isOdooActive ? '#9333ea' : '#64748b', padding: '8px 16px', fontSize: '14px' }} onClick={() => setIsOdooActive(!isOdooActive)}>
                  {isOdooActive ? "Active" : "Paused"}
                </button>
              </div>
              
              {isOdooActive && triggerMode === "SPECIFIC_PRODUCT" && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e9d5ff' }}>
                  <label className="form-label" style={{ color: '#6b21a8', fontSize: '13px' }}>Odoo Trigger Product ID or SKU (Optional)</label>
                  <p style={{ fontSize: '12px', color: 'var(--app-text-muted)', margin: '4px 0 8px 0' }}>
                    Since Odoo uses different Product IDs than Shopify, specify the Odoo product ID or SKU that triggers this automation. 
                    If left blank, ALL Odoo webhooks will generate a discount code.
                  </p>
                  <input 
                    className="form-input" 
                    type="text" 
                    placeholder="e.g. 12345 or SKU-HONEY-01" 
                    value={odooTriggerProductId} 
                    onChange={(e) => setOdooTriggerProductId(e.target.value)} 
                    style={{ borderColor: '#d8b4fe' }}
                  />
                </div>
              )}
            </div>`;
            
  // We need to replace the old odoo HTML block which didn't have the new input.
  // The simplest way is to regex match the old block and replace it.
  const regex = /<div className="form-group" style=\{\{ marginTop: '24px'.*?<\/div>\n            <\/div>/s;
  file = file.replace(regex, odooToggleHTML);
  
  await fs.writeFile('app/routes/app.settings.tsx', file);
  console.log("Patched app.settings.tsx UI for odoo trigger");
}
run();
