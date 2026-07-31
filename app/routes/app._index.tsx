import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { requireAppUser } from "../auth.server";
import prisma from "../db.server";
import { orderQueue } from "../queue.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const user = await requireAppUser(request, "canViewDashboard");

  if (!user) {
    // Check if they are just logged out (which is handled by app.tsx) or lacking permission
    // Actually if they lack permission we should redirect them to a page they CAN view.
    // For simplicity, if user is null we just return empty so app.tsx can render the login screen safely.
    return { totalLogs: 0, recentLogs: [] };
  }

  const shop = session.shop;

  const settings = await prisma.appSettings.findUnique({ where: { shop } });
  
  const totalLogs = await prisma.log.count({ where: { shop } });
  const recentLogs = await prisma.log.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  const queueCounts = await orderQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
  const rawJobs = await orderQueue.getJobs(['active', 'waiting'], 0, 5, true);
  const activeJobs = rawJobs.map(job => ({
    id: job.id,
    orderId: job.data?.orderId,
    status: job.isWaiting() ? 'waiting' : 'active'
  }));

  return { totalLogs, recentLogs, settings, queueCounts, activeJobs };
};

export default function Dashboard() {
  const { totalLogs, recentLogs } = useLoaderData<typeof loader>();

  return (
    <div className="custom-dashboard">
      
      <div className="hero-banner">
        <div className="hero-content">
          <h1>Loyalty Automation Engine</h1>
          <p>Your store is actively generating customized discount experiences.</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.2)', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h3 className="metric-title">Webhooks Processed</h3>
          </div>
          <span className="metric-value">{totalLogs}</span>
        </div>
        
        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            </div>
            <h3 className="metric-title">Codes Generated</h3>
          </div>
          <span className="metric-value">{totalLogs * 2}</span>
        </div>
        
        <div className="metric-card">
          <div className="metric-header">
            <div className="metric-icon-box" style={{ background: '#ecfdf5' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
            </div>
            <h3 className="metric-title">Queue Status</h3>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'baseline' }}>
            <span className="metric-value" style={{ color: 'var(--app-primary)' }}>{queueCounts.active + queueCounts.waiting}</span>
            <span style={{ color: 'var(--app-text-muted)', fontSize: '14px', fontWeight: 500 }}>Active / Pending</span>
          </div>
        </div>
      </div>

      <div className="custom-card" style={{ background: '#f8fafc', borderColor: '#e2e8f0', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          Current Active Rules
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: 'var(--app-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Trigger Condition</p>
            <p style={{ margin: 0, fontWeight: 500 }}>{settings?.triggerMode === "SPECIFIC_PRODUCT" ? "Specific Product Checkout" : "Any Product Checkout"}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: 'var(--app-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Discount 1 (Target)</p>
            <p style={{ margin: 0, fontWeight: 500, color: 'var(--app-primary)' }}>{settings?.discountPercentageProduct?.toString()}% Off Target Product</p>
          </div>
          <div>
            <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: 'var(--app-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Discount 2 (Storewide)</p>
            <p style={{ margin: 0, fontWeight: 500, color: 'var(--app-primary)' }}>{settings?.discountPercentageStore?.toString()}% Off Storewide</p>
          </div>
        </div>
      </div>

      {activeJobs.length > 0 && (
        <div className="custom-card" style={{ marginBottom: '24px', borderColor: '#bfdbfe' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 16px 0', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', background: '#3b82f6', borderRadius: '50%', animation: 'pulse 2s infinite' }}></div>
            Currently Processing in Queue
          </h2>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {activeJobs.map(job => (
              <div key={job.id} style={{ background: job.status === 'active' ? '#dbeafe' : '#f1f5f9', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, color: job.status === 'active' ? '#1e40af' : '#475569', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {job.status === 'active' ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>}
                Order #{job.orderId}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="custom-card">
        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 24px 0' }}>Recent Activity Logs</h2>
        
        <div style={{ overflowX: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer Name</th>
                <th>Product Code</th>
                <th>Storewide Code</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.length > 0 ? (
                recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td>#{log.orderId}</td>
                    <td style={{ fontWeight: 500 }}>{log.customerName || 'N/A'}</td>
                    <td><span className="badge badge-neutral">{log.productCode}</span></td>
                    <td><span className="badge badge-neutral">{log.storewideCode}</span></td>
                    <td style={{ color: 'var(--app-text-muted)', fontSize: '12px' }}>
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '48px', color: 'var(--app-text-muted)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: '12px' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                    <p style={{ margin: 0 }}>No automated discounts generated yet.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
