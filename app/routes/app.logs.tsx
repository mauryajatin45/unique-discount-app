import type { LoaderFunctionArgs} from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form, useNavigation } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { requireAppUser } from "../auth.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const user = await requireAppUser(request, "canViewLogs");

  if (!user) {
    return json({ logs: [], totalPages: 0, currentPage: 1, q: "", sort: "createdAt_desc", totalCount: 0 });
  }

  const shop = session.shop;
  const url = new URL(request.url);
  
  const q = url.searchParams.get("q") || "";
  const page = Math.max(parseInt(url.searchParams.get("page") || "1", 10), 1);
  const sort = url.searchParams.get("sort") || "createdAt_desc";
  const limit = 50;
  const skip = (page - 1) * limit;

  // Validate sort parameter to prevent injection
  const validSortFields = ["createdAt", "orderId"];
  const validSortOrders = ["asc", "desc"];
  const [sortFieldRaw, sortOrderRaw] = sort.split("_");
  
  const sortField = validSortFields.includes(sortFieldRaw) ? sortFieldRaw : "createdAt";
  const sortOrder = validSortOrders.includes(sortOrderRaw) ? sortOrderRaw : "desc";
  const orderBy = { [sortField]: sortOrder };

  // Building the where clause
  const where: any = { shop };
  
  if (q) {
    where.OR = [
      { orderName: { contains: q } },
      { orderId: { contains: q } },
      { customerName: { contains: q } },
      { productCode: { contains: q } },
      { storewideCode: { contains: q } }
    ];
  }

  const [logs, totalCount] = await Promise.all([
    prisma.log.findMany({
      where,
      orderBy,
      take: limit,
      skip
    }),
    prisma.log.count({ where })
  ]);

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return json({ 
    logs, 
    totalPages, 
    currentPage: page, 
    q, 
    sort: `${sortField}_${sortOrder}`, 
    totalCount 
  });
};

export default function LogsPage() {
  const { logs, totalPages, currentPage, q, sort, totalCount } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSearching = navigation.state === "loading";

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("sort", sort);
    params.set("page", newPage.toString());
    submit(params, { method: "get" });
  };

  return (
    <div className="custom-dashboard">
      
      <div className="hero-banner" style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}>
        <div className="hero-content">
          <h1>System Logs & Queues</h1>
          <p>Complete history of processed orders and generated discount codes.</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.2)', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </div>
      </div>

      <div className="custom-card" style={{ padding: 0 }}>
        
        {/* Toolbar: Search & Sort */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#fafafa', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
          <Form 
            method="get" 
            style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}
            onChange={(e) => {
              // Automatically submit on select change (but not on every keystroke of input)
              const target = e.target as HTMLInputElement | HTMLSelectElement;
              if (target.name === 'sort') submit(e.currentTarget);
            }}
          >
            {/* Search Input */}
            <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
              <input 
                type="text" 
                name="q" 
                defaultValue={q} 
                placeholder="Search by Order ID, Customer Name, or Discount Code..." 
                className="custom-input"
                style={{ paddingLeft: '36px', width: '100%', boxSizing: 'border-box' }}
              />
              <svg style={{ position: 'absolute', left: '12px', top: '10px', color: '#9ca3af' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            
            {/* Sort Select */}
            <select 
              name="sort" 
              defaultValue={sort} 
              className="custom-input" 
              style={{ width: 'auto', minWidth: '180px' }}
            >
              <option value="createdAt_desc">Newest First</option>
              <option value="createdAt_asc">Oldest First</option>
              <option value="orderId_desc">Order ID (Desc)</option>
              <option value="orderId_asc">Order ID (Asc)</option>
            </select>
            
            {/* Search Button */}
            <button type="submit" className="btn btn-primary" disabled={isSearching} style={{ minWidth: '100px' }}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            
            {/* Clear Button (only show if there's an active search) */}
            {q && (
              <button 
                type="button" 
                className="btn" 
                onClick={() => submit({ q: "", sort, page: "1" }, { method: "get" })}
              >
                Clear
              </button>
            )}
          </Form>
        </div>

        <div style={{ overflowX: 'auto', opacity: isSearching ? 0.6 : 1, transition: 'opacity 0.2s' }}>
          <table className="custom-table" style={{ margin: 0, width: '100%' }}>
            <thead>
              <tr>
                <th>Source</th>
                <th>Order ID</th>
                <th>Customer Name</th>
                <th>Generated Rules Context</th>
                <th>Target Code</th>
                <th>Storewide Code</th>
                <th>Generated At</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} style={{ transition: 'background-color 0.2s', cursor: 'default' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                    <td>
                      {log.orderId.startsWith('ODOO-') ? (
                        <span className="badge" style={{ backgroundColor: '#e9d5ff', color: '#7e22ce' }}>Odoo</span>
                      ) : (
                        <span className="badge" style={{ backgroundColor: '#dcfce3', color: '#166534' }}>Shopify</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--app-primary)' }}>
                      {log.orderName || (log.orderId.startsWith('ODOO-') ? '#' + log.orderId.replace('ODOO-', '') : '#' + log.orderId)}
                    </td>
                    <td style={{ fontWeight: 500 }}>{log.customerName || 'N/A'}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--app-text-muted)' }}>Trigger: {log.triggerModeUsed === "SPECIFIC_PRODUCT" ? "Specific Product" : "Any Product"}</span>
                        <span style={{ fontSize: '12px', color: 'var(--app-text-muted)' }}>Discount: {log.discountPercentageProductUsed?.toString()}% / {log.discountPercentageStoreUsed?.toString()}%</span>
                      </div>
                    </td>
                    <td><span className="badge badge-success" style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}>{log.productCode}</span></td>
                    <td><span className="badge badge-success" style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}>{log.storewideCode}</span></td>
                    <td style={{ color: 'var(--app-text-muted)', fontSize: '12px' }}>
                      {log.createdAt.replace('T', ' ').substring(0, 19)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '64px 32px', color: 'var(--app-text-muted)' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, marginBottom: '16px' }}>
                      <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <p style={{ margin: 0, fontSize: '16px', fontWeight: 500 }}>No results found.</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '14px', opacity: 0.8 }}>Try adjusting your search query or clear the filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {totalCount > 0 && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '16px 24px', 
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#fafafa',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '12px',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div style={{ color: 'var(--app-text-muted)', fontSize: '14px' }}>
              Showing <strong>{(currentPage - 1) * 50 + 1}</strong> to <strong>{Math.min(currentPage * 50, totalCount)}</strong> of <strong>{totalCount}</strong> logs
            </div>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isSearching}
                className="btn"
                style={{ opacity: currentPage <= 1 ? 0.5 : 1, padding: '6px 12px' }}
              >
                Previous
              </button>
              
              <span style={{ fontSize: '14px', color: 'var(--app-text-muted)', padding: '0 8px' }}>
                Page {currentPage} of {totalPages}
              </span>
              
              <button 
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isSearching}
                className="btn"
                style={{ opacity: currentPage >= totalPages ? 0.5 : 1, padding: '6px 12px' }}
              >
                Next
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
