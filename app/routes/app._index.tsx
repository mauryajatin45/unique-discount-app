import { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const totalLogs = await prisma.log.count({ where: { shop } });
  const recentLogs = await prisma.log.findMany({
    where: { shop },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  return { totalLogs, recentLogs };
};

export default function Dashboard() {
  const { totalLogs, recentLogs } = useLoaderData<typeof loader>();

  return (
    <div className="custom-dashboard">
      <div className="custom-card">
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px' }}>
          Loyalty Automation Engine
        </h1>
        
        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-title">Webhooks Processed Today</span>
            <span className="metric-value">{totalLogs}</span>
          </div>
          <div className="metric-card">
            <span className="metric-title">Discount Codes Generated</span>
            <span className="metric-value">{totalLogs * 2}</span>
          </div>
          <div className="metric-card">
            <span className="metric-title">Queue Status</span>
            <span className="metric-value" style={{ color: 'var(--app-primary)' }}>Active</span>
          </div>
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '32px 0 16px 0' }}>Live Execution Logs</h2>
        
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
                  <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--app-text-muted)' }}>
                    No logs generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '32px 0 16px 0' }}>Automation Pipeline</h2>
        <div className="pipeline-container">
          <div className="pipeline-step">
            <div className="step-number active">01</div>
            <div>
              <p className="step-title">Order Webhook</p>
              <p className="step-subtitle">Shopify orders/create</p>
            </div>
          </div>
          <div className="pipeline-arrow">→</div>
          <div className="pipeline-step">
            <div className="step-number active">02</div>
            <div>
              <p className="step-title">Generate Codes</p>
              <p className="step-subtitle">Discount API - 2 codes</p>
            </div>
          </div>
          <div className="pipeline-arrow">→</div>
          <div className="pipeline-step">
            <div className="step-number pending">03</div>
            <div>
              <p className="step-title">External API</p>
              <p className="step-subtitle">Pending Integration</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
