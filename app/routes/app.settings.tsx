import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs} from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { requireAppUser } from "../auth.server";
import prisma from "../db.server";
import bcrypt from "bcryptjs";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const user = await requireAppUser(request, "canViewSettings");
  
  if (!user) {
    return json({ 
      settings: { isActive: false, triggerMode: "ALL_PRODUCTS", triggerProductId: "", targetProductId: "", discountPercentageProduct: 10, discountPercentageStore: 15, logRetentionDays: 30 },
      users: [] as any[]
    });
  }
  const shop = session.shop;

  let settings = await prisma.appSettings.findUnique({ where: { shop } });
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: { shop, isActive: false, logRetentionDays: 30 }
    });
  }

  const users = await prisma.appUser.findMany({ 
    where: { shop },
    select: { id: true, email: true, canViewDashboard: true, canViewLogs: true, canViewSettings: true } 
  });

  return json({ settings, users });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_settings") {
    const isActive = formData.get("isActive") === "true";
    const triggerMode = formData.get("triggerMode")?.toString() || "ALL_PRODUCTS";
    const triggerProductId = formData.get("triggerProductId")?.toString();
    const targetProductId = formData.get("targetProductId")?.toString();
    const discountPercentageProduct = parseFloat(formData.get("discountPercentageProduct")?.toString() || "10");
    const discountPercentageStore = parseFloat(formData.get("discountPercentageStore")?.toString() || "15");
    const logRetentionDays = parseInt(formData.get("logRetentionDays")?.toString() || "30", 10);

    await prisma.appSettings.update({
      where: { shop },
      data: { isActive, triggerMode, triggerProductId, targetProductId, discountPercentageProduct, discountPercentageStore, logRetentionDays }
    });
    return json({ success: true, message: "Settings saved" });
  }

  if (intent === "add_user") {
    const email = formData.get("email")?.toString();
    const password = formData.get("password")?.toString();
    const canViewDashboard = formData.get("canViewDashboard") === "true";
    const canViewLogs = formData.get("canViewLogs") === "true";
    const canViewSettings = formData.get("canViewSettings") === "true";

    if (email && password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.appUser.create({ 
        data: { shop, email, password: hashedPassword, canViewDashboard, canViewLogs, canViewSettings } 
      });
      return json({ success: true, message: "User added successfully" });
    }
  }

  if (intent === "delete_user") {
    const id = parseInt(formData.get("userId")?.toString() || "0", 10);
    if (id) {
      await prisma.appUser.delete({ where: { id } });
      return json({ success: true, message: "User removed" });
    }
  }

  if (intent === "reset_password") {
    const id = parseInt(formData.get("userId")?.toString() || "0", 10);
    const password = formData.get("newPassword")?.toString();
    if (id && password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.appUser.update({ where: { id }, data: { password: hashedPassword } });
      return json({ success: true, message: "Password reset successfully" });
    }
  }

  return json({ success: false });
};

export default function SettingsPage() {
  const { settings, users } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [isActive, setIsActive] = useState(settings.isActive);
  const [triggerMode, setTriggerMode] = useState(settings.triggerMode || "ALL_PRODUCTS");
  const [triggerProductId, setTriggerProductId] = useState(settings.triggerProductId || "");
  const [targetProductId, setTargetProductId] = useState(settings.targetProductId || "");
  const [discountPercentageProduct, setDiscountPercentageProduct] = useState(settings.discountPercentageProduct?.toString() || "10");
  const [discountPercentageStore, setDiscountPercentageStore] = useState(settings.discountPercentageStore?.toString() || "15");
  const [logRetentionDays, setLogRetentionDays] = useState(settings.logRetentionDays?.toString() || "30");

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [permDashboard, setPermDashboard] = useState(true);
  const [permLogs, setPermLogs] = useState(true);
  const [permSettings, setPermSettings] = useState(false);

  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const actionData = fetcher.data as any;

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message);
      if (actionData.message === "User added successfully") {
        setNewUserEmail("");
        setNewUserPassword("");
        setPermDashboard(true);
        setPermLogs(true);
        setPermSettings(false);
      }
      if (actionData.message === "Password reset successfully") {
        setResetUserId(null);
        setResetPassword("");
      }
    }
  }, [actionData, shopify]);

  const handleSaveSettings = () => {
    fetcher.submit(
      {
        intent: "save_settings",
        isActive: isActive.toString(),
        triggerMode,
        triggerProductId: triggerProductId || "",
        targetProductId: targetProductId || "",
        discountPercentageProduct,
        discountPercentageStore,
        logRetentionDays
      },
      { method: "POST" }
    );
  };

  const handleAddUser = () => {
    if (!newUserEmail || !newUserPassword) return;
    fetcher.submit(
      { 
        intent: "add_user", 
        email: newUserEmail, 
        password: newUserPassword,
        canViewDashboard: permDashboard.toString(),
        canViewLogs: permLogs.toString(),
        canViewSettings: permSettings.toString()
      },
      { method: "POST" }
    );
  };

  const handleDeleteUser = (userId: number) => {
    if (confirm("Are you sure you want to remove access for this user?")) {
      fetcher.submit(
        { intent: "delete_user", userId: userId.toString() },
        { method: "POST" }
      );
    }
  };

  const handleResetPassword = (userId: number) => {
    if (!resetPassword) return;
    fetcher.submit(
      { intent: "reset_password", userId: userId.toString(), newPassword: resetPassword },
      { method: "POST" }
    );
  };

  const handleSelectProduct = async (type: 'trigger' | 'target') => {
    try {
      const selection = await shopify.resourcePicker({ type: 'product', multiple: true, action: 'select' });
      if (selection && selection.length > 0) {
        const ids = selection.map((s: any) => s.id).join(',');
        if (type === 'trigger') {
          setTriggerProductId(ids);
        } else {
          setTargetProductId(ids);
        }
      }
    } catch (err) {
      console.log("Resource picker cancelled or failed", err);
    }
  };

  return (
    <div className="custom-dashboard">
      <div className="hero-banner" style={{ background: 'linear-gradient(135deg, #374151 0%, #111827 100%)' }}>
        <div className="hero-content">
          <h1>Configuration Settings</h1>
          <p>Manage offer rules, user access, and system preferences.</p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.1)', width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </div>
      </div>

      <div className="custom-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isActive ? '#ecfdf5' : '#fffbeb', padding: '24px', borderRadius: '12px', border: `1px solid ${isActive ? '#10b981' : '#f59e0b'}`, marginBottom: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: isActive ? '#065f46' : '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: isActive ? '#10b981' : '#f59e0b' }}></div>
              {isActive ? "Engine is Active" : "Engine is Paused"}
            </h3>
            <p style={{ margin: '8px 0 0 0', fontSize: '14px', color: isActive ? '#047857' : '#b45309' }}>
              {isActive ? "The system is currently listening for incoming orders and generating discounts automatically." : "No discounts will be generated for new orders until you activate the engine."}
            </p>
          </div>
          <button className="btn-primary" style={{ background: isActive ? '#ef4444' : '#10b981', padding: '12px 24px', fontSize: '16px' }} onClick={() => setIsActive(!isActive)}>
            {isActive ? "Deactivate Engine" : "Activate Engine"}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', marginBottom: '40px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
              Offer Rules
            </h2>
            <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px', border: '1px solid var(--app-border)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>1. When should the discounts be generated?</h3>
              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                    <input type="radio" name="triggerMode" value="ALL_PRODUCTS" checked={triggerMode === "ALL_PRODUCTS"} onChange={(e) => setTriggerMode(e.target.value)} /> For every order (Any Product)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                    <input type="radio" name="triggerMode" value="SPECIFIC_PRODUCT" checked={triggerMode === "SPECIFIC_PRODUCT"} onChange={(e) => setTriggerMode(e.target.value)} /> Only when a specific product is purchased
                  </label>
                </div>
              </div>

              {triggerMode === "SPECIFIC_PRODUCT" && (
                <div className="form-group" style={{ marginTop: '16px', paddingLeft: '16px', borderLeft: '2px solid var(--app-primary)' }}>
                  <label className="form-label">Which product must they buy?</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="form-input" value={triggerProductId} readOnly placeholder="Click select to choose..." style={{ background: '#fff' }} />
                    <button className="btn-primary" style={{ background: '#374151' }} onClick={() => handleSelectProduct('trigger')}>Select Product</button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px', border: '1px solid var(--app-border)', marginTop: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>2. What discounts do they receive?</h3>
              <p style={{ fontSize: '13px', color: 'var(--app-text-muted)', marginBottom: '16px' }}>The app always generates 2 unique codes for the customer.</p>
              
              <div className="form-group" style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Discount Code 1: Specific Product</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '12px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '12px', color: 'var(--app-text-muted)' }}>Discount Amount (%)</label>
                    <input className="form-input" type="number" value={discountPercentageProduct} onChange={(e) => setDiscountPercentageProduct(e.target.value)} style={{ marginTop: '4px' }} />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: '12px', color: 'var(--app-text-muted)' }}>Applies to which product?</label>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <input className="form-input" value={targetProductId} readOnly placeholder="Choose product..." style={{ background: '#f9fafb' }} />
                      <button className="btn-primary" style={{ background: '#374151' }} onClick={() => handleSelectProduct('target')}>Select</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ background: '#fff', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', margin: 0, marginTop: '16px' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>Discount Code 2: Entire Store</label>
                <div style={{ marginTop: '12px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--app-text-muted)' }}>Discount Amount (%)</label>
                  <input className="form-input" type="number" value={discountPercentageStore} onChange={(e) => setDiscountPercentageStore(e.target.value)} style={{ marginTop: '4px', maxWidth: '150px' }} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              System Preferences
            </h2>
            <div className="form-group">
              <label className="form-label">Log Retention (Days)</label>
              <input className="form-input" type="number" value={logRetentionDays} onChange={(e) => setLogRetentionDays(e.target.value)} />
              <p style={{ fontSize: '13px', color: 'var(--app-text-muted)', marginTop: '8px', lineHeight: 1.4 }}>
                Logs older than this threshold will be automatically purged from the database to save storage space and maintain performance.
              </p>
            </div>
          </div>
        </div>
        
        <div style={{ textAlign: 'right', marginBottom: '48px', borderBottom: '1px solid var(--app-border)', paddingBottom: '32px' }}>
          <button className="btn-primary" onClick={handleSaveSettings} disabled={fetcher.state !== "idle"} style={{ padding: '12px 32px', fontSize: '16px' }}>
            {fetcher.state !== "idle" ? "Saving Changes..." : "Save Settings"}
          </button>
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          Granular User Management
        </h2>
        <p style={{ color: 'var(--app-text-muted)', marginBottom: '24px', fontSize: '14px', maxWidth: '600px', lineHeight: 1.5 }}>
          Create restricted users and explicitly grant them access to specific pages within this dashboard. They will be prompted for this ID and Password when accessing the app.
        </p>
        
        <div style={{ background: '#f9fafb', padding: '24px', borderRadius: '12px', border: '1px solid var(--app-border)', marginBottom: '32px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Add New User</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">User ID (Email)</label>
              <input className="form-input" type="email" placeholder="staff@example.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Password</label>
              <input className="form-input" type="password" placeholder="••••••••" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label className="form-label" style={{ marginBottom: '12px' }}>Page Permissions</label>
            <div style={{ display: 'flex', gap: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                <input type="checkbox" checked={permDashboard} onChange={(e) => setPermDashboard(e.target.checked)} /> Dashboard
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                <input type="checkbox" checked={permLogs} onChange={(e) => setPermLogs(e.target.checked)} /> Logs & Queues
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                <input type="checkbox" checked={permSettings} onChange={(e) => setPermSettings(e.target.checked)} /> Settings
              </label>
            </div>
          </div>

          <button className="btn-primary" style={{ background: '#374151' }} onClick={handleAddUser} disabled={!newUserEmail || !newUserPassword}>
            Create Restricted User
          </button>
        </div>

        <div style={{ border: '1px solid var(--app-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="custom-table" style={{ margin: 0 }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ borderBottom: '1px solid var(--app-border)' }}>Email Address</th>
                <th style={{ borderBottom: '1px solid var(--app-border)' }}>Permissions</th>
                <th style={{ borderBottom: '1px solid var(--app-border)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ fontWeight: 500 }}>{user.email}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {user.canViewDashboard && <span className="badge badge-neutral" style={{ background: '#dbeafe', color: '#1e40af' }}>Dashboard</span>}
                      {user.canViewLogs && <span className="badge badge-neutral" style={{ background: '#ede9fe', color: '#5b21b6' }}>Logs</span>}
                      {user.canViewSettings && <span className="badge badge-neutral" style={{ background: '#fef3c7', color: '#92400e' }}>Settings</span>}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {resetUserId === user.id ? (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <input type="text" className="form-input" placeholder="New Password" style={{ width: '120px', padding: '4px 8px', fontSize: '12px', margin: 0 }} value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} />
                        <button onClick={() => handleResetPassword(user.id)} disabled={!resetPassword} style={{ color: resetPassword ? 'var(--app-primary)' : 'var(--app-border)', background: 'none', border: 'none', cursor: resetPassword ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 600 }}>Save</button>
                        <button onClick={() => setResetUserId(null)} style={{ color: 'var(--app-text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => { setResetUserId(user.id); setResetPassword(""); }} style={{ color: 'var(--app-primary)', background: 'rgba(16,185,129,0.1)', padding: '6px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                          Reset Password
                        </button>
                        <button onClick={() => handleDeleteUser(user.id)} style={{ color: 'var(--app-danger)', background: 'rgba(239,68,68,0.1)', padding: '6px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                          Revoke
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: '32px', color: 'var(--app-text-muted)' }}>No staff users added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
