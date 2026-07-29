import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError, useFetcher } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { authenticate } from "../shopify.server";
import { getAppUser, createAppUserSession } from "../auth.server";
import prisma from "../db.server";
import bcrypt from "bcryptjs";

import customStyles from "../styles/custom.css?url";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: customStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const appUser = await getAppUser(request);

  // If this is the very first time the app is run (no users exist), we could auto-create a default admin,
  // but we'll assume the merchant will add users manually or there's a seed.
  // Actually, let's ensure there's at least one admin user if the table is empty for this shop.
  const userCount = await prisma.appUser.count({ where: { shop: session.shop } });
  if (userCount === 0) {
    const defaultPassword = await bcrypt.hash("admin123", 10);
    await prisma.appUser.create({
      data: {
        shop: session.shop,
        email: "admin",
        password: defaultPassword,
        canViewDashboard: true,
        canViewLogs: true,
        canViewSettings: true,
      }
    });
  }

  return json({ 
    apiKey: process.env.SHOPIFY_API_KEY || "", 
    appUser, 
    shop: session.shop 
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  if (formData.get("intent") === "login") {
    const email = formData.get("email")?.toString();
    const password = formData.get("password")?.toString();

    if (!email || !password) return json({ error: "Email and password are required" }, { status: 400 });

    const user = await prisma.appUser.findFirst({
      where: { shop: session.shop, email }
    });

    if (!user) return json({ error: "Invalid credentials" }, { status: 401 });

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return json({ error: "Invalid credentials" }, { status: 401 });

    const headers = await createAppUserSession({ request, userId: user.id });
    return json({ success: true }, { headers });
  }

  return json({});
};

export default function App() {
  const { apiKey, appUser } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {!appUser ? (
        <LoginScreen />
      ) : (
        <>
          <NavMenu>
            {appUser.canViewDashboard && <Link to="/app" rel="home">Dashboard</Link>}
            {appUser.canViewLogs && <Link to="/app/logs">Logs & Queues</Link>}
            {appUser.canViewSettings && <Link to="/app/settings">Settings</Link>}
          </NavMenu>
          <Outlet />
        </>
      )}
    </AppProvider>
  );
}

function LoginScreen() {
  const fetcher = useFetcher<typeof action>();
  const isLoggingIn = fetcher.state === "submitting";

  return (
    <div className="custom-dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
      <div className="custom-card" style={{ maxWidth: '400px', width: '100%', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ background: 'var(--app-primary)', width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'white' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px 0' }}>App Authentication</h1>
          <p style={{ color: 'var(--app-text-muted)', margin: 0, fontSize: '14px' }}>Please enter your staff credentials to access the dashboard.</p>
        </div>

        {(fetcher.data as any)?.error && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '6px', marginBottom: '24px', fontSize: '14px', textAlign: 'center' }}>
            {(fetcher.data as any).error}
          </div>
        )}

        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="login" />
          <div className="form-group">
            <label className="form-label">User ID (Email)</label>
            <input type="text" name="email" className="form-input" required placeholder="admin" />
          </div>
          <div className="form-group" style={{ marginBottom: '32px' }}>
            <label className="form-label">Password</label>
            <input type="password" name="password" className="form-input" required placeholder="••••••••" />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '12px', fontSize: '16px' }} disabled={isLoggingIn}>
            {isLoggingIn ? "Authenticating..." : "Sign In"}
          </button>
        </fetcher.Form>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
