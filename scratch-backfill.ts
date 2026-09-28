export const buildBackfillSection = () => {
  return `
        {/* BACKFILL SECTION */}
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '48px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
          Discount Automation Backfill
        </h2>
        <p style={{ color: 'var(--app-text-muted)', marginBottom: '24px', fontSize: '14px', maxWidth: '600px', lineHeight: 1.5 }}>
          Run a one-time backfill for customers who purchased an eligible product before the automation was enabled. This process is idempotent and will skip users who already received a code.
        </p>

        <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px', border: '1px solid var(--app-border)', marginBottom: '48px' }}>
          <fetcher.Form method="post">
            <input type="hidden" name="actionType" value="previewBackfill" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Product ID</label>
                <input className="form-input" type="text" name="productId" placeholder="e.g. 9624214438144" required />
              </div>
              <div className="form-group" style={{ margin: 0 }}></div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Timeframe Start</label>
                <input className="form-input" type="datetime-local" name="startDate" required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Timeframe End</label>
                <input className="form-input" type="datetime-local" name="endDate" required />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '16px' }}>
              <button type="submit" className="btn-secondary" style={{ padding: '8px 24px' }} disabled={fetcher.state !== "idle"}>
                {fetcher.state !== "idle" ? "Loading..." : "Preview Customers"}
              </button>
            </div>
          </fetcher.Form>
          
          {fetcher.data?.previewData && (
            <div style={{ marginTop: '24px', padding: '16px', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <h4 style={{ margin: '0 0 16px 0', fontSize: '15px' }}>Preview Results</h4>
              <ul style={{ margin: '0 0 24px 0', paddingLeft: '20px', color: '#4b5563', lineHeight: 1.6 }}>
                <li><strong>Eligible purchases found:</strong> {fetcher.data.previewData.totalFound}</li>
                <li><strong>Already notified (skipping):</strong> {fetcher.data.previewData.totalSkipped}</li>
                <li><strong>Pending notifications:</strong> {fetcher.data.previewData.totalPending}</li>
              </ul>
              
              {fetcher.data.previewData.totalPending > 0 ? (
                <fetcher.Form method="post">
                  <input type="hidden" name="actionType" value="runBackfill" />
                  <input type="hidden" name="productId" value={fetcher.data.previewData.productId} />
                  <input type="hidden" name="startDate" value={fetcher.data.previewData.startDate} />
                  <input type="hidden" name="endDate" value={fetcher.data.previewData.endDate} />
                  <button type="submit" className="btn-primary" style={{ padding: '8px 24px', background: '#2563eb' }} disabled={fetcher.state !== "idle"} onClick={(e) => {
                    if (!confirm(\`You are about to send the discount message to \${fetcher.data.previewData.totalPending} customers. Continue?\`)) e.preventDefault();
                  }}>
                    Run Backfill Now
                  </button>
                </fetcher.Form>
              ) : (
                <p style={{ color: '#10b981', fontWeight: 600, margin: 0 }}>All eligible customers have already been processed!</p>
              )}
            </div>
          )}
          
          {fetcher.data?.backfillSuccess && (
            <div style={{ marginTop: '24px', padding: '16px', background: '#ecfdf5', border: '1px solid #10b981', borderRadius: '8px', color: '#065f46' }}>
              <p style={{ margin: 0, fontWeight: 500 }}>✅ Backfill successfully queued!</p>
              <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>The background processor is now handling the queued orders. Check the Logs page for delivery status.</p>
            </div>
          )}
        </div>
  `;
}
