import { useEffect, useState } from "react";
import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let settings = await prisma.appSettings.findUnique({ where: { shop } });
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: { shop, isActive: false, logRetentionDays: 30 }
    });
  }

  const users = await prisma.appUser.findMany({ where: { shop } });

  return json({ settings, users });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_settings") {
    const isActive = formData.get("isActive") === "true";
    const targetProductId = formData.get("targetProductId")?.toString();
    const discountPercentageProduct = parseFloat(formData.get("discountPercentageProduct")?.toString() || "10");
    const discountPercentageStore = parseFloat(formData.get("discountPercentageStore")?.toString() || "15");
    const logRetentionDays = parseInt(formData.get("logRetentionDays")?.toString() || "30", 10);

    await prisma.appSettings.update({
      where: { shop },
      data: { isActive, targetProductId, discountPercentageProduct, discountPercentageStore, logRetentionDays }
    });
    return json({ success: true, message: "Settings saved" });
  }

  if (intent === "add_user") {
    const email = formData.get("email")?.toString();
    const role = formData.get("role")?.toString() || "Staff";
    if (email) {
      await prisma.appUser.create({ data: { shop, email, role } });
      return json({ success: true, message: "User added" });
    }
  }

  if (intent === "delete_user") {
    const id = parseInt(formData.get("userId")?.toString() || "0", 10);
    if (id) {
      await prisma.appUser.delete({ where: { id } });
      return json({ success: true, message: "User removed" });
    }
  }

  return json({ success: false });
};

export default function SettingsPage() {
  const { settings, users } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [isActive, setIsActive] = useState(settings.isActive);
  const [targetProductId, setTargetProductId] = useState(settings.targetProductId || "");
  const [discountPercentageProduct, setDiscountPercentageProduct] = useState(settings.discountPercentageProduct?.toString() || "10");
  const [discountPercentageStore, setDiscountPercentageStore] = useState(settings.discountPercentageStore?.toString() || "15");
  const [logRetentionDays, setLogRetentionDays] = useState(settings.logRetentionDays?.toString() || "30");
  const [newUserEmail, setNewUserEmail] = useState("");

  const actionData = fetcher.data as any;

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show(actionData.message);
      if (actionData.message === "User added") setNewUserEmail("");
    }
  }, [actionData, shopify]);

  const handleSaveSettings = () => {
    fetcher.submit(
      {
        intent: "save_settings",
        isActive: isActive.toString(),
        targetProductId,
        discountPercentageProduct,
        discountPercentageStore,
        logRetentionDays
      },
      { method: "POST" }
    );
  };

  const handleAddUser = () => {
    if (!newUserEmail) return;
    fetcher.submit(
      { intent: "add_user", email: newUserEmail, role: "Staff" },
      { method: "POST" }
    );
  };

  const handleDeleteUser = (userId: number) => {
    fetcher.submit(
      { intent: "delete_user", userId: userId.toString() },
      { method: "POST" }
    );
  };

  const handleSelectProduct = async () => {
    try {
      const selection = await shopify.resourcePicker({ type: 'product', multiple: false, action: 'select' });
      if (selection && selection.length > 0) {
        setTargetProductId(selection[0].id);
      }
    } catch (err) {
      console.log("Resource picker cancelled or failed", err);
    }
  };

  return (
    <div className="custom-dashboard">
      <div className="custom-card">
        <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '24px' }}>Configuration Settings</h1>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isActive ? '#ecfdf5' : '#fffbeb', padding: '16px', borderRadius: '8px', border: `1px solid ${isActive ? '#10b981' : '#f59e0b'}`, marginBottom: '24px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', color: isActive ? '#065f46' : '#92400e' }}>
              {isActive ? "Offer is Active" : "Offer is Disabled"}
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: isActive ? '#047857' : '#b45309' }}>
              {isActive ? "System is listening for orders." : "System is paused."}
            </p>
          </div>
          <button className="btn-primary" style={{ background: isActive ? '#ef4444' : '#10b981' }} onClick={() => setIsActive(!isActive)}>
            {isActive ? "Deactivate" : "Activate"}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Offer Rules</h2>
            <div className="form-group">
              <label className="form-label">Target Product ID</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="form-input" value={targetProductId} readOnly placeholder="Select a product..." />
                <button className="btn-primary" onClick={handleSelectProduct}>Select</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Discount for Target (%)</label>
              <input className="form-input" type="number" value={discountPercentageProduct} onChange={(e) => setDiscountPercentageProduct(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Discount Storewide (%)</label>
              <input className="form-input" type="number" value={discountPercentageStore} onChange={(e) => setDiscountPercentageStore(e.target.value)} />
            </div>
          </div>

          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>System Preferences</h2>
            <div className="form-group">
              <label className="form-label">Log Retention (Days)</label>
              <input className="form-input" type="number" value={logRetentionDays} onChange={(e) => setLogRetentionDays(e.target.value)} />
              <p style={{ fontSize: '12px', color: 'var(--app-text-muted)', marginTop: '4px' }}>Logs older than this will be automatically deleted to save space.</p>
            </div>
          </div>
        </div>
        
        <div style={{ textAlign: 'right', marginBottom: '48px', borderBottom: '1px solid var(--app-border)', paddingBottom: '32px' }}>
          <button className="btn-primary" onClick={handleSaveSettings} disabled={fetcher.state !== "idle"}>
            {fetcher.state !== "idle" ? "Saving..." : "Save Settings"}
          </button>
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>User Management (App Roles)</h2>
        <p style={{ color: 'var(--app-text-muted)', marginBottom: '16px', fontSize: '14px' }}>
          Add staff emails here to explicitly grant them access to this dashboard. (Note: They must also have staff access in your Shopify Admin).
        </p>
        
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', maxWidth: '400px' }}>
          <input className="form-input" type="email" placeholder="staff@example.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
          <button className="btn-primary" onClick={handleAddUser}>Add</button>
        </div>

        <table className="custom-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td style={{ fontWeight: 500 }}>{user.email}</td>
                <td><span className="badge badge-neutral">{user.role}</span></td>
                <td>
                  <button onClick={() => handleDeleteUser(user.id)} style={{ color: 'var(--app-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '16px', color: 'var(--app-text-muted)' }}>No users added yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
