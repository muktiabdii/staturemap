import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import * as authUtils from "@/src/lib/auth-utils";
import { UserRepository } from "@/src/server/repositories";
import type { AuthUser } from "@/src/lib/api-middleware";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(token?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new NextRequest("http://localhost/api/v1/test", { headers });
}

function makeDbUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: "user-123",
    name: "Nakes Kemiri",
    email: "nakes@test.com",
    role: "NAKES",
    accountStatus: "ACTIVE",
    workRegion: { regionCode: "35.07.13.2001" },
    ...overrides,
  };
}

function mockVerifyToken(payload: Partial<{ sub: string }> | null) {
  return vi.spyOn(authUtils, "verifyToken").mockResolvedValue(
    payload as Awaited<ReturnType<typeof authUtils.verifyToken>>
  );
}

function mockFindById(user: ReturnType<typeof makeDbUser> | null) {
  return vi
    .spyOn(UserRepository.prototype, "findById")
    .mockResolvedValue(user as never);
}

// Import lazily to get fresh module-level userRepo spy per test
async function getMiddleware() {
  return import("@/src/lib/api-middleware");
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.JWT_SECRET = "test-secret-long-enough-for-hs256-32chars!";
});

// ─── ssoAuth ─────────────────────────────────────────────────────────────────

describe("ssoAuth", () => {
  it("calls handler with AuthUser when token is valid and account is active", async () => {
    const { ssoAuth } = await getMiddleware();
    mockVerifyToken({ sub: "user-123" });
    mockFindById(makeDbUser());

    // eslint-disable-next-line prefer-const
    let captured!: AuthUser;
    const handler = vi.fn(async (_req: NextRequest, _ctx: unknown, authUser: AuthUser) => {
      captured = authUser;
      return new Response("ok");
    });

    await ssoAuth(handler)(makeRequest("valid-token"), {});

    expect(handler).toHaveBeenCalledOnce();
    expect(captured.id).toBe("user-123");
    expect(captured.role).toBe("NAKES");
    expect(captured.workRegionCode).toBe("35.07.13.2001");
    expect(captured.name).toBe("Nakes Kemiri");
    expect(captured.email).toBe("nakes@test.com");
  });

  it("returns 401 when Authorization header is missing", async () => {
    const { ssoAuth } = await getMiddleware();
    const res = await ssoAuth(vi.fn())(makeRequest(), {});
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is invalid/expired", async () => {
    const { ssoAuth } = await getMiddleware();
    mockVerifyToken(null);
    const res = await ssoAuth(vi.fn())(makeRequest("bad-token"), {});
    expect(res.status).toBe(401);
  });

  it("returns 401 when token has no sub claim", async () => {
    const { ssoAuth } = await getMiddleware();
    mockVerifyToken({} as { sub: string }); // sub absent
    const res = await ssoAuth(vi.fn())(makeRequest("token-no-sub"), {});
    expect(res.status).toBe(401);
  });

  it("returns 401 when user is not found in database", async () => {
    const { ssoAuth } = await getMiddleware();
    mockVerifyToken({ sub: "ghost-id" });
    mockFindById(null);
    const res = await ssoAuth(vi.fn())(makeRequest("valid-token"), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when account is INACTIVE", async () => {
    const { ssoAuth } = await getMiddleware();
    mockVerifyToken({ sub: "user-123" });
    mockFindById(makeDbUser({ accountStatus: "INACTIVE" }));
    const res = await ssoAuth(vi.fn())(makeRequest("valid-token"), {});
    expect(res.status).toBe(403);
  });

  it("role comes from database, not from JWT claims", async () => {
    const { ssoAuth } = await getMiddleware();
    // Token claims ADMIN, but DB says NAKES
    mockVerifyToken({ sub: "user-123" });
    mockFindById(makeDbUser({ role: "NAKES" }));

    let capturedRole: string | undefined;
    await ssoAuth(async (_req, _ctx, u) => {
      capturedRole = u.role;
      return new Response("ok");
    })(makeRequest("valid-token"), {});

    expect(capturedRole).toBe("NAKES");
  });

  it("workRegionCode comes from database, not from JWT claims", async () => {
    const { ssoAuth } = await getMiddleware();
    mockVerifyToken({ sub: "user-123" });
    mockFindById(makeDbUser({ workRegion: { regionCode: "35.07.13.9999" } }));

    let capturedCode: string | null | undefined;
    await ssoAuth(async (_req, _ctx, u) => {
      capturedCode = u.workRegionCode;
      return new Response("ok");
    })(makeRequest("valid-token"), {});

    expect(capturedCode).toBe("35.07.13.9999");
  });

  it("workRegionCode is null for ADMIN with no workRegion", async () => {
    const { ssoAuth } = await getMiddleware();
    mockVerifyToken({ sub: "user-admin" });
    mockFindById(makeDbUser({ role: "ADMIN", workRegion: null }));

    let capturedCode: string | null | undefined;
    await ssoAuth(async (_req, _ctx, u) => {
      capturedCode = u.workRegionCode;
      return new Response("ok");
    })(makeRequest("valid-token"), {});

    expect(capturedCode).toBeNull();
  });

  it("returns 401 when database throws", async () => {
    const { ssoAuth } = await getMiddleware();
    mockVerifyToken({ sub: "user-123" });
    vi.spyOn(UserRepository.prototype, "findById").mockRejectedValue(
      new Error("DB connection lost")
    );
    const res = await ssoAuth(vi.fn())(makeRequest("valid-token"), {});
    expect(res.status).toBe(401);
  });

  it("response body matches API contract { message, statusCode }", async () => {
    const { ssoAuth } = await getMiddleware();
    const res = await ssoAuth(vi.fn())(makeRequest(), {});
    const body = await res.json();
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("statusCode", 401);
    expect(body).not.toHaveProperty("error"); // old key must be gone
  });
});

// ─── role ─────────────────────────────────────────────────────────────────────

describe("role", () => {
  it("calls handler when user role is in allowedRoles", async () => {
    const { role } = await getMiddleware();
    mockVerifyToken({ sub: "user-123" });
    mockFindById(makeDbUser({ role: "ADMIN" }));

    const handler = vi.fn(async () => new Response("ok"));
    const res = await role(["ADMIN"], handler)(makeRequest("valid-token"), {});

    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("returns 403 when user role is not in allowedRoles", async () => {
    const { role } = await getMiddleware();
    mockVerifyToken({ sub: "user-123" });
    mockFindById(makeDbUser({ role: "NAKES" }));

    const res = await role(["ADMIN"], vi.fn())(makeRequest("valid-token"), {});
    expect(res.status).toBe(403);
  });

  it("returns 401 when token is missing (inherits from ssoAuth)", async () => {
    const { role } = await getMiddleware();
    const res = await role(["ADMIN"], vi.fn())(makeRequest(), {});
    expect(res.status).toBe(401);
  });

  it("returns 403 when account is INACTIVE before role check", async () => {
    const { role } = await getMiddleware();
    mockVerifyToken({ sub: "user-123" });
    mockFindById(makeDbUser({ accountStatus: "INACTIVE" }));

    const res = await role(["ADMIN"], vi.fn())(makeRequest("valid-token"), {});
    expect(res.status).toBe(403);
  });
});

// ─── silentAuth ───────────────────────────────────────────────────────────────

describe("silentAuth", () => {
  it("passes authUser to handler when token is valid", async () => {
    const { silentAuth } = await getMiddleware();
    mockVerifyToken({ sub: "user-123" });
    mockFindById(makeDbUser());

    let capturedUser: AuthUser | null = null;
    await silentAuth(async (_req, _ctx, u: AuthUser | null) => {
      capturedUser = u;
      return new Response("ok");
    })(makeRequest("valid-token"), {});

    expect(capturedUser).not.toBeNull();
    expect((capturedUser as unknown as AuthUser).id).toBe("user-123");
  });

  it("passes null to handler when token is missing (non-blocking)", async () => {
    const { silentAuth } = await getMiddleware();

    let capturedUser: AuthUser | null = Symbol("sentinel") as unknown as AuthUser;
    const res = await silentAuth(async (_req, _ctx, u) => {
      capturedUser = u;
      return new Response("ok");
    })(makeRequest(), {});

    expect(res.status).toBe(200);
    expect(capturedUser).toBeNull();
  });

  it("passes null when account is INACTIVE (non-blocking)", async () => {
    const { silentAuth } = await getMiddleware();
    mockVerifyToken({ sub: "user-123" });
    mockFindById(makeDbUser({ accountStatus: "INACTIVE" }));

    let capturedUser: AuthUser | null = Symbol("sentinel") as unknown as AuthUser;
    await silentAuth(async (_req, _ctx, u) => {
      capturedUser = u;
      return new Response("ok");
    })(makeRequest("valid-token"), {});

    expect(capturedUser).toBeNull();
  });
});
