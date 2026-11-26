import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/src/lib/auth-utils";
import { UserRepository } from "@/src/server/repositories";
import { ACCOUNT_STATUS } from "@/src/constants/common";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  workRegionCode: string | null;
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
export const NAKES_ROLES = ["NAKES"];
export const ALL_ROLES = ["ADMIN", "NAKES"];

const userRepo = new UserRepository();

/**
 * Resolves a verified identity from the Bearer token.
 *
 * Returns:
 *   - { user: AuthUser }  — token valid, account active
 *   - { error: 401 }      — token missing, malformed, expired, or user not found
 *   - { error: 403 }      — token valid but account is INACTIVE
 */
async function resolveUser(
  req: NextRequest
): Promise<{ user: AuthUser } | { error: 401 | 403 }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: 401 };

  const token = authHeader.slice(7); // "Bearer ".length === 7
  const payload = await verifyToken(token);
  if (!payload?.sub) return { error: 401 };

  let dbUser: Awaited<ReturnType<UserRepository["findById"]>>;
  try {
    dbUser = await userRepo.findById(payload.sub);
  } catch {
    return { error: 401 };
  }

  if (!dbUser) return { error: 401 };

  if (dbUser.accountStatus === ACCOUNT_STATUS.INACTIVE) return { error: 403 };

  return {
    user: {
      id: dbUser.userId,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      workRegionCode: dbUser.workRegion?.regionCode ?? null,
    },
  };
}

/**
 * ssoAuth — Mandatory authentication. Validates token AND account status via DB.
 * 401 if token is missing/invalid/user not found; 403 if account is INACTIVE.
 */
export function ssoAuth(handler: AuthenticatedHandler) {
  return async (req: NextRequest, ctx: RouteContext = {}) => {
    const result = await resolveUser(req);
    if ("error" in result) {
      return NextResponse.json(
        { message: result.error === 401 ? "Unauthorized" : "Akun tidak aktif", statusCode: result.error },
        { status: result.error }
      );
    }
    return handler(req, ctx, result.user);
  };
}

/**
 * role — RBAC guard (wraps ssoAuth).
 * 401/403 from ssoAuth propagate; 403 if authenticated role is not in allowedRoles.
 */
export function role(allowedRoles: string[], handler: AuthenticatedHandler) {
  return ssoAuth(async (req, ctx, authUser) => {
    if (!allowedRoles.includes(authUser.role)) {
      return NextResponse.json(
        { message: "Forbidden", statusCode: 403 },
        { status: 403 }
      );
    }
    return handler(req, ctx, authUser);
  });
}

/**
 * silentAuth — Optional authentication (non-blocking).
 * authUser is null if the token is absent, invalid, or the account is inactive.
 */
export function silentAuth(handler: OptionalAuthHandler) {
  return async (req: NextRequest, ctx: RouteContext = {}) => {
    const result = await resolveUser(req);
    const authUser = "user" in result ? result.user : null;
    return handler(req, ctx, authUser);
  };
}
