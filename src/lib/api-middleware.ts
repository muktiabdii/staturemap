import { NextRequest, NextResponse } from "next/server";

export interface AuthUser {
  id: string;
  email?: string | null;
  role?: string;
}

type RouteContext = { params?: Promise<Record<string, string>> };

type AuthenticatedHandler = (
  req: NextRequest,
  ctx: RouteContext,
  authUser: AuthUser
) => Promise<NextResponse | Response>;

type OptionalAuthHandler = (
  req: NextRequest,
  ctx: RouteContext,
  authUser: AuthUser | null
) => Promise<NextResponse | Response>;

export const ADMIN_ROLES = ["ADMIN"];
export const ALL_ROLES = ["ADMIN", "NAKES"];

async function resolveUser(req: NextRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const token = authHeader.replace("Bearer ", "");
    const { verifyToken } = await import("@/src/lib/auth-utils");
    const payload = await verifyToken(token);
    if (!payload) return null;

    return {
      id: payload.sub as string,
      email: payload.email as string | null,
      role: payload.role as string | undefined,
    };
  } catch {
    return null;
  }
}

/**
 * ssoAuth — Mandatory Bearer token authentication.
 * Returns 401 if token is missing or invalid.
 */
export function ssoAuth(handler: AuthenticatedHandler) {
  return async (req: NextRequest, ctx: RouteContext = {}) => {
    const authUser = await resolveUser(req);
    if (!authUser) {
      return NextResponse.json(
        { error: "Unauthorized", statusCode: 401 },
        { status: 401 }
      );
    }
    return handler(req, ctx, authUser);
  };
}

/**
 * role — Role-based access control (includes ssoAuth).
 * Returns 401 if not authenticated, 403 if role not allowed.
 */
export function role(allowedRoles: string[], handler: AuthenticatedHandler) {
  return ssoAuth(async (req, ctx, authUser) => {
    if (!authUser.role || !allowedRoles.includes(authUser.role)) {
      return NextResponse.json(
        { error: "Forbidden", statusCode: 403 },
        { status: 403 }
      );
    }
    return handler(req, ctx, authUser);
  });
}

/**
 * silentAuth — Optional Bearer token authentication (non-blocking).
 * authUser will be null if token is missing or invalid.
 */
export function silentAuth(handler: OptionalAuthHandler) {
  return async (req: NextRequest, ctx: RouteContext = {}) => {
    const authUser = await resolveUser(req);
    return handler(req, ctx, authUser);
  };
}
