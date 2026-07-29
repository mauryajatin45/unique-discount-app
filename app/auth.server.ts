import { createCookieSessionStorage, redirect } from "@remix-run/node";
import prisma from "./db.server";
import bcrypt from "bcryptjs";

const sessionSecret = process.env.SESSION_SECRET || "fallback_default_secret_for_dev";

export const appAuthSessionStorage = createCookieSessionStorage({
  cookie: {
    name: "_app_user_auth",
    secure: process.env.NODE_ENV === "production",
    secrets: [sessionSecret],
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: true,
  },
});

export async function getAppUserSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return appAuthSessionStorage.getSession(cookie);
}

export async function getAppUserId(request: Request): Promise<number | null> {
  const session = await getAppUserSession(request);
  const userId = session.get("appUserId");
  if (!userId) return null;
  return parseInt(userId, 10);
}

export async function getAppUser(request: Request) {
  const userId = await getAppUserId(request);
  if (userId === null) return null;

  const user = await prisma.appUser.findUnique({
    where: { id: userId },
    select: { id: true, email: true, shop: true, canViewDashboard: true, canViewLogs: true, canViewSettings: true }
  });

  return user;
}

export async function requireAppUser(request: Request, requiredPermission?: 'canViewDashboard' | 'canViewLogs' | 'canViewSettings') {
  const user = await getAppUser(request);
  
  if (!user) {
    throw redirect("/app"); // Redirect to the main app layout which handles the login screen
  }

  if (requiredPermission && !user[requiredPermission]) {
    // If they don't have permission for this specific page, redirect to the app root
    throw redirect("/app");
  }

  return user;
}

export async function createAppUserSession({
  request,
  userId,
}: {
  request: Request;
  userId: number;
}) {
  const session = await getAppUserSession(request);
  session.set("appUserId", userId.toString());

  return new Headers({
    "Set-Cookie": await appAuthSessionStorage.commitSession(session),
  });
}
