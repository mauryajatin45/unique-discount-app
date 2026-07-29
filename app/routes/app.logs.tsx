import type { LoaderFunctionArgs} from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { requireAppUser } from "../auth.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const user = await requireAppUser(request, "canViewLogs");

  if (!user) {
    return json({ logs: [] });
  }

  const shop = session.shop;

  const logs = await prisma.log.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
    take: 50 // Show last 50 logs for now
  });

  return json({ logs });
};

export default function LogsPage() {
  const { logs } = useLoaderData<typeof loader>();

  return (
    <div className="custom-dashboard">
      
      <div className="hero-banner" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
        <div className="hero-content">
          <h1>System Logs & Queues</h1>
          <p>Complete history of processed orders and generated discount codes.</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.2)', padding: '12px', borderRadius: '50%' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </div>
      </div>

      <div className="custom-card">
        
        <div style={{ overflowX: 'auto' }}>
          <table className="custom-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer Name</th>
                <th>Target Code</th>
                <th>Storewide Code</th>
                <th>Generated At</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} style={{ transition: 'background-color 0.2s', cursor: 'default' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td style={{ fontWeight: 600, color: 'var(--app-primary)' }}>#{log.orderId}</td>
                    <td style={{ fontWeight: 500 }}>{log.customerName || 'N/A'}</td>
                    <td><span className="badge badge-success" style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}>{log.productCode}</span></td>
                    <td><span className="badge badge-success" style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}>{log.storewideCode}</span></td>
                    <td style={{ color: 'var(--app-text-muted)', fontSize: '12px' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '64px 32px', color: 'var(--app-text-muted)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: '16px' }}>
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>
                    </svg>
                    <p style={{ margin: 0, fontSize: '16px' }}>No logs generated yet.</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '14px', opacity: 0.8 }}>Logs will appear here once orders are processed.</p>
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
