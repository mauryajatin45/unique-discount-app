import { LoaderFunctionArgs, json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
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
      <div className="custom-card">
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>
          System Logs & Queues
        </h1>
        <p style={{ color: 'var(--app-text-muted)', marginBottom: '24px' }}>
          Complete history of processed orders and generated discount codes.
        </p>
        
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
                  <tr key={log.id}>
                    <td>#{log.orderId}</td>
                    <td style={{ fontWeight: 500 }}>{log.customerName || 'N/A'}</td>
                    <td><span className="badge badge-success">{log.productCode}</span></td>
                    <td><span className="badge badge-success">{log.storewideCode}</span></td>
                    <td style={{ color: 'var(--app-text-muted)', fontSize: '12px' }}>
                      {new Date(log.createdAt).toLocaleString()}
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
      </div>
    </div>
  );
}
