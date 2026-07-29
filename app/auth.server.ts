import { createCookieSessionStorage } from "@remix-run/node";
import prisma from "./db.server";

const sessionSecret = process.env.SESSION_SECRET || "fallback_default_secret_for_dev";

export const appAuthSessionStorage = createCookieSessionStorage({
  cookie: {
    name: "_app_user_auth",
    secure: true,
    secrets: [sessionSecret],
    sameSite: "none",
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
    return null;
  }

  if (requiredPermission && !user[requiredPermission]) {
    return null;
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
