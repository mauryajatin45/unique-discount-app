import fs from 'fs/promises';

async function run() {
  const file = await fs.readFile('app/routes/app.settings.tsx', 'utf-8');
  
  const odooToggleHTML = `
            <div className="form-group" style={{ marginTop: '24px', background: isOdooActive ? '#faf5ff' : '#f8fafc', padding: '24px', borderRadius: '12px', border: \`1px solid \${isOdooActive ? '#d8b4fe' : '#e2e8f0'}\` }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#6b21a8' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                Odoo API Integration
              </h2>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--app-text-muted)', flex: 1 }}>Allow the system to automatically generate discounts for manual Odoo sales orders received via webhook.</p>
                <button className="btn-primary" style={{ background: isOdooActive ? '#9333ea' : '#64748b', padding: '8px 16px', fontSize: '14px' }} onClick={() => setIsOdooActive(!isOdooActive)}>
                  {isOdooActive ? "Active" : "Paused"}
                </button>
              </div>
            </div>`;
            
  const newFile = file.replace(
    '<h2>System Preferences</h2>', // Wait, the UI has `<h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>` Let me just replace `System Preferences`
    `System Preferences`
  ).replace(
    '<div className="form-group">\n              <label className="form-label">Log Retention (Days)</label>',
    `${odooToggleHTML}\n            <div className="form-group" style={{ marginTop: '24px' }}>\n              <label className="form-label">Log Retention (Days)</label>`
  );

  await fs.writeFile('app/routes/app.settings.tsx', newFile);
  console.log("Patched app.settings.tsx UI for Odoo toggle");
}
run();
