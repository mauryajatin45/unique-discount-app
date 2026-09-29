import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import { useState, useRef } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.appSettings.findUnique({ where: { shop: session.shop } });
  return json({
    shop: session.shop,
    isActive: settings?.isActive ?? false,
    triggerMode: settings?.triggerMode || "ALL_PRODUCTS",
    hasTriggerProduct: !!settings?.triggerProductId,
    hasTargetProduct: !!settings?.targetProductId
  });
};

type Result = {
  status: string;
  error?: string;
  hint?: string;
  order?: { id: string; name: string; customerName?: string; lineItems?: string };
  existing?: {
    id: number;
    orderName: string;
    productCode: string | null;
    storewideCode: string | null;
    customerName: string | null;
    customerPhone: string | null;
    createdAt: string;
  };
  warnings?: string[];
  canForce?: boolean;
};

export default function ManualProcessPage() {
  const { isActive, triggerMode, hasTriggerProduct, hasTargetProduct } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<Result>();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isLoading = fetcher.state !== "idle";
  const result = fetcher.data as Result | undefined;

  const submit = (force = false) => {
    const val = input.trim();
    if (!val) {
      inputRef.current?.focus();
      return;
    }
    fetcher.submit(
      { rawInput: val, force },
      { method: "POST", action: "/api/manual-process", encType: "application/json" }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit(false);
  };

  const reset = () => {
    setInput("");
    fetcher.load("/app/manual"); // clear fetcher state
  };

  return (
    <div className="custom-dashboard">
      <style>{`
        .manual-result { border-radius: 12px; padding: 24px; margin-top: 24px; border: 1px solid; }
        .manual-result.success { background: #f0fdf4; border-color: #86efac; }
        .manual-result.warning { background: #fffbeb; border-color: #fcd34d; }
        .manual-result.error { background: #fef2f2; border-color: #fca5a5; }
        .manual-result.info { background: #eff6ff; border-color: #93c5fd; }
        .result-title { font-size: 16px; font-weight: 700; margin: 0 0 8px 0; }
        .result-desc { font-size: 14px; margin: 0 0 16px 0; line-height: 1.6; }
        .result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
        .result-field { background: rgba(255,255,255,0.7); border-radius: 8px; padding: 12px; }
        .result-field label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; display: block; margin-bottom: 4px; }
        .result-field span { font-size: 15px; font-weight: 600; color: #111827; font-family: monospace; }
        .code-badge { background: #dcfce7; color: #166534; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 14px; font-weight: 700; letter-spacing: 1px; }
        .warn-list { list-style: none; padding: 0; margin: 12px 0 0 0; }
        .warn-list li { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: #92400e; padding: 6px 0; border-bottom: 1px solid #fde68a; }
        .warn-list li:last-child { border-bottom: none; }
        .order-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
        .order-tag { background: rgba(255,255,255,0.7); border: 1px solid rgba(0,0,0,0.1); border-radius: 20px; padding: 3px 10px; font-size: 12px; color: #374151; }
        .hint-box { background: rgba(255,255,255,0.6); border-radius: 8px; padding: 12px; margin-top: 12px; font-size: 13px; color: #374151; }
      `}</style>

      {/* Hero */}
      <div className="hero-banner" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)" }}>
        <div className="hero-content">
          <h1>Manual Order Processing</h1>
          <p>Generate discount codes for orders that were missed by the automatic system.</p>
        </div>
        <div style={{ background: "rgba(255,255,255,0.2)", width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
      </div>

      {/* Config warnings */}
      {(!isActive || !hasTargetProduct) && (
        <div className="custom-card" style={{ background: "#fef3c7", border: "1px solid #fcd34d" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#92400e", fontWeight: 500 }}>
            ⚠️ {!isActive ? "The discount offer is currently paused in your app settings." : ""}
            {!hasTargetProduct ? " No target product is configured in app settings." : ""}
            {" "}<Link to="/app/settings" style={{ color: "#92400e", textDecoration: "underline" }}>Go to Settings →</Link>
          </p>
        </div>
      )}

      {/* Main form */}
      <div className="custom-card">
        <h2 style={{ margin: "0 0 6px 0", fontSize: 18, fontWeight: 700 }}>Enter Order</h2>
        <p style={{ margin: "0 0 20px 0", color: "var(--app-text-muted)", fontSize: 14 }}>
          Enter the Shopify order number (e.g. <code>#92509</code>) or the full numeric order ID.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <input
              ref={inputRef}
              type="text"
              className="custom-input"
              placeholder="#92509 or 7215940796672"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 16 }}
              autoFocus
            />
          </div>
          <button
            className="btn-primary"
            onClick={() => submit(false)}
            disabled={isLoading || !input.trim()}
            style={{ padding: "10px 24px", fontSize: 15 }}
          >
            {isLoading ? (
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                </svg>
                Checking...
              </span>
            ) : "Process Order"}
          </button>
          {result && (
            <button className="btn" onClick={reset} style={{ padding: "10px 16px" }}>
              Clear
            </button>
          )}
        </div>

        {/* Info: what this does */}
        <div style={{ marginTop: 20, padding: "14px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--app-text-muted)", lineHeight: 1.6 }}>
            <strong>What this does:</strong> The system will validate the order, create discount codes, generate the loyalty card PDF, and trigger the WhatsApp message — exactly as if the order had been received automatically.
            {triggerMode === "SPECIFIC_PRODUCT" && hasTriggerProduct && (
              <> Since you use <strong>Specific Product</strong> trigger mode, orders without the trigger product will show a warning but can be force-processed.</>
            )}
          </p>
        </div>
      </div>

      {/* ── Result area ── */}
      {result && (
        <>
          {/* ✅ Queued successfully */}
          {result.status === "queued" && (
            <div className="manual-result success">
              <p className="result-title">✅ Order Queued for Processing</p>
              <p className="result-desc">
                <strong>{result.order?.name}</strong> has been added to the processing queue. Discount codes will be generated and the WhatsApp message will be sent in a few seconds. Check the <Link to="/app/logs" style={{ color: "#166534" }}>Logs page</Link> to confirm.
              </p>
              <div className="order-meta">
                <span className="order-tag">👤 {result.order?.customerName}</span>
                {result.order?.customerPhone && <span className="order-tag">📱 {result.order.customerPhone}</span>}
                <span className="order-tag">💰 {result.order?.currency} {result.order?.totalPrice}</span>
                {result.order?.lineItems && result.order.lineItems.length > 0 && (
                  <span className="order-tag">📦 {result.order.lineItems.slice(0, 2).join(", ")}{(result.order.lineItems.length ?? 0) > 2 ? ` +${(result.order.lineItems.length ?? 0) - 2} more` : ""}</span>
                )}
              </div>
              {result.warnings && result.warnings.length > 0 && (
                <ul className="warn-list" style={{ marginTop: 16, background: "#fffbeb", borderRadius: 8, padding: "8px 12px" }}>
                  {result.warnings.map((w, i) => (
                    <li key={i}><span>⚠️</span> {w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* 🔁 Already processed */}
          {result.status === "already_processed" && result.existing && (
            <div className="manual-result info">
              <p className="result-title">🔁 Already Processed</p>
              <p className="result-desc">
                Order <strong>{result.order?.name}</strong> was already processed on{" "}
                <strong>{new Date(result.existing.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</strong>.
                Codes are already generated for this order.
              </p>
              <div className="result-grid">
                <div className="result-field">
                  <label>Product Code</label>
                  <span className="code-badge">{result.existing.productCode || "—"}</span>
                </div>
                <div className="result-field">
                  <label>Storewide Code</label>
                  <span className="code-badge">{result.existing.storewideCode || "—"}</span>
                </div>
                <div className="result-field">
                  <label>Customer</label>
                  <span style={{ fontFamily: "inherit", fontSize: 14 }}>{result.existing.customerName || "Unknown"}</span>
                </div>
                <div className="result-field">
                  <label>Phone</label>
                  <span style={{ fontFamily: "inherit", fontSize: 14 }}>{result.existing.customerPhone || "No phone"}</span>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <Link to={`/app/logs?q=${result.order?.name}`} className="btn-primary" style={{ display: "inline-block", textDecoration: "none", fontSize: 14 }}>
                  View in Logs →
                </Link>
              </div>
            </div>
          )}

          {/* ⚡ Trigger product not found — show force option */}
          {result.status === "trigger_not_found" && (
            <div className="manual-result warning">
              <p className="result-title">⚡ Trigger Product Not Found</p>
              <p className="result-desc">{result.error}</p>
              {result.order?.lineItems && (
                <div className="hint-box">
                  <strong>Items in this order:</strong> {result.order.lineItems}
                </div>
              )}
              {result.hint && (
                <div className="hint-box" style={{ marginTop: 8 }}>💡 {result.hint}</div>
              )}
              {result.canForce && (
                <div style={{ marginTop: 16 }}>
                  <button
                    className="btn-primary"
                    onClick={() => submit(true)}
                    disabled={isLoading}
                    style={{ background: "#f59e0b" }}
                  >
                    ⚡ Force Process Anyway
                  </button>
                  <p style={{ margin: "8px 0 0 0", fontSize: 12, color: "#92400e" }}>
                    This will generate codes even though the trigger product is not in the order.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 🔄 Already queued */}
          {result.status === "already_queued" && (
            <div className="manual-result info">
              <p className="result-title">🔄 Already Being Processed</p>
              <p className="result-desc">{result.error}</p>
              <Link to="/app/logs" className="btn-primary" style={{ display: "inline-block", textDecoration: "none", fontSize: 14 }}>
                Check Logs →
              </Link>
            </div>
          )}

          {/* ❌ Order cancelled */}
          {result.status === "order_cancelled" && (
            <div className="manual-result error">
              <p className="result-title">❌ Order Cancelled</p>
              <p className="result-desc">{result.error}</p>
            </div>
          )}

          {/* 💳 Not paid */}
          {result.status === "not_paid" && (
            <div className="manual-result error">
              <p className="result-title">💳 Order Not Paid</p>
              <p className="result-desc">{result.error}</p>
              <p style={{ margin: "8px 0 0 0", fontSize: 13, color: "#6b7280" }}>Wait for the payment to complete, then process the order.</p>
            </div>
          )}

          {/* 🔍 Not found */}
          {result.status === "not_found" && (
            <div className="manual-result error">
              <p className="result-title">🔍 Order Not Found</p>
              <p className="result-desc">{result.error}</p>
              <div className="hint-box" style={{ background: "#fff", borderLeft: "3px solid #fca5a5" }}>
                <strong>Tips:</strong>
                <ul style={{ margin: "6px 0 0 0", paddingLeft: 20, fontSize: 13, color: "#374151" }}>
                  <li>Try with the # prefix: <code>#92509</code></li>
                  <li>Or paste the full numeric Shopify order ID from the URL</li>
                  <li>Make sure you're on the correct store</li>
                </ul>
              </div>
            </div>
          )}

          {/* ⚠️ Validation / other errors */}
          {(result.status === "validation_error" || result.status === "error") && (
            <div className="manual-result error">
              <p className="result-title">⚠️ {result.status === "validation_error" ? "Invalid Input" : "Error"}</p>
              <p className="result-desc">{result.error}</p>
            </div>
          )}
        </>
      )}

      {/* Spinner keyframe */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
