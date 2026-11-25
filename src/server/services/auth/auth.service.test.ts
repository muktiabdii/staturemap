import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthService, AuthError } from "./auth.service";
import * as authUtils from "@/src/lib/auth-utils";
import { UserRepository } from "@/src/server/repositories";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PLAIN_PASSWORD = "correct-password-123";

/** Build a fake UserForAuth record. Fields can be overridden. */
function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: "user-uuid-1234",
    name: "Nakes Kemiri",
    email: "nakes@test.com",
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$fake$hash", // placeholder — overridden in relevant tests
    role: "NAKES",
    accountStatus: "ACTIVE",
    workRegionId: "region-uuid-5678",
    workRegion: {
      regionCode: "35.07.13.2001",
      regionLevel: "VILLAGE",
    },
    ...overrides,
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.JWT_SECRET = "test-secret-long-enough-for-hs256-32chars!";
});

// ─── Helpers for spying ───────────────────────────────────────────────────────

function mockFindByEmail(user: ReturnType<typeof makeUser> | null) {
  return vi
    .spyOn(UserRepository.prototype, "findByEmail")
    .mockResolvedValue(user as never);
}

function mockVerifyPassword(result: boolean) {
  return vi.spyOn(authUtils, "verifyPassword").mockResolvedValue(result);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AuthService.login", () => {
  describe("successful login — NAKES", () => {
    it("returns a token, expires_at, and user payload", async () => {
      mockFindByEmail(makeUser());
      mockVerifyPassword(true);

      const result = await AuthService.login({
        email: "nakes@test.com",
        password: PLAIN_PASSWORD,
      });

      expect(result.access_token).toBeDefined();
      expect(typeof result.access_token).toBe("string");
      expect(result.access_token.split(".").length).toBe(3); // valid JWT structure
      expect(result.expires_at).toBeDefined();
      expect(new Date(result.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it("user payload does not contain passwordHash", async () => {
      mockFindByEmail(makeUser());
      mockVerifyPassword(true);

      const result = await AuthService.login({
        email: "nakes@test.com",
        password: PLAIN_PASSWORD,
      });

      expect(result.user).not.toHaveProperty("passwordHash");
      expect(result.user).not.toHaveProperty("password_hash");
    });

    it("user payload contains user_id, name, email, role, work_region_code", async () => {
      mockFindByEmail(makeUser());
      mockVerifyPassword(true);

      const result = await AuthService.login({
        email: "nakes@test.com",
        password: PLAIN_PASSWORD,
      });

      expect(result.user.user_id).toBe("user-uuid-1234");
      expect(result.user.name).toBe("Nakes Kemiri");
      expect(result.user.email).toBe("nakes@test.com");
      expect(result.user.role).toBe("NAKES");
      expect(result.user.work_region_code).toBe("35.07.13.2001");
    });

    it("JWT token contains the correct claims", async () => {
      mockFindByEmail(makeUser());
      mockVerifyPassword(true);

      const result = await AuthService.login({
        email: "nakes@test.com",
        password: PLAIN_PASSWORD,
      });

      const payload = await authUtils.verifyToken(result.access_token);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe("user-uuid-1234");
      expect(payload?.role).toBe("NAKES");
      expect(payload?.email).toBe("nakes@test.com");
      expect(payload?.workRegionCode).toBe("35.07.13.2001");
    });

    it("JWT exp matches expires_at in response body", async () => {
      mockFindByEmail(makeUser());
      mockVerifyPassword(true);

      const result = await AuthService.login({
        email: "nakes@test.com",
        password: PLAIN_PASSWORD,
      });

      const payload = await authUtils.verifyToken(result.access_token);
      const expFromToken = new Date(payload!.exp! * 1000).toISOString();
      expect(result.expires_at).toBe(expFromToken);
    });
  });

  describe("successful login — ADMIN", () => {
    it("work_region_code is null for ADMIN", async () => {
      mockFindByEmail(
        makeUser({ role: "ADMIN", workRegionId: null, workRegion: null })
      );
      mockVerifyPassword(true);

      const result = await AuthService.login({
        email: "nakes@test.com",
        password: PLAIN_PASSWORD,
      });

      expect(result.user.work_region_code).toBeNull();
    });

    it("JWT workRegionCode is null for ADMIN", async () => {
      mockFindByEmail(
        makeUser({ role: "ADMIN", workRegionId: null, workRegion: null })
      );
      mockVerifyPassword(true);

      const result = await AuthService.login({
        email: "nakes@test.com",
        password: PLAIN_PASSWORD,
      });

      const payload = await authUtils.verifyToken(result.access_token);
      expect(payload?.workRegionCode).toBeNull();
    });
  });

  describe("wrong credentials", () => {
    it("throws AuthError 401 when email is not found", async () => {
      mockFindByEmail(null);

      await expect(
        AuthService.login({ email: "ghost@test.com", password: PLAIN_PASSWORD })
      ).rejects.toMatchObject({ statusCode: 401, message: "Email atau password salah" });
    });

    it("throws AuthError 401 when password is wrong", async () => {
      mockFindByEmail(makeUser());
      mockVerifyPassword(false);

      await expect(
        AuthService.login({ email: "nakes@test.com", password: "wrong" })
      ).rejects.toMatchObject({ statusCode: 401, message: "Email atau password salah" });
    });

    it("does not distinguish 'email not found' from 'wrong password' (no user enumeration)", async () => {
      mockFindByEmail(null);
      let errNotFound!: AuthError;
      await AuthService.login({ email: "ghost@test.com", password: PLAIN_PASSWORD }).catch(
        (e: AuthError) => { errNotFound = e; }
      );

      mockFindByEmail(makeUser());
      mockVerifyPassword(false);
      let errWrongPass!: AuthError;
      await AuthService.login({ email: "nakes@test.com", password: "wrong" }).catch(
        (e: AuthError) => { errWrongPass = e; }
      );

      expect(errNotFound.message).toBe(errWrongPass.message);
      expect(errNotFound.statusCode).toBe(errWrongPass.statusCode);
    });
  });

  describe("inactive account", () => {
    it("throws AuthError 403 when accountStatus is INACTIVE", async () => {
      mockFindByEmail(makeUser({ accountStatus: "INACTIVE" }));
      mockVerifyPassword(true);

      await expect(
        AuthService.login({ email: "nakes@test.com", password: PLAIN_PASSWORD })
      ).rejects.toMatchObject({ statusCode: 403, message: "Akun tidak aktif" });
    });
  });

  describe("NAKES work region rules", () => {
    it("throws AuthError 403 when NAKES has no workRegion", async () => {
      mockFindByEmail(
        makeUser({ role: "NAKES", workRegionId: null, workRegion: null })
      );
      mockVerifyPassword(true);

      await expect(
        AuthService.login({ email: "nakes@test.com", password: PLAIN_PASSWORD })
      ).rejects.toMatchObject({ statusCode: 403 });
    });

    it("throws AuthError 403 when NAKES workRegion is not VILLAGE level", async () => {
      mockFindByEmail(
        makeUser({
          workRegion: { regionCode: "35.07", regionLevel: "REGENCY" },
        })
      );
      mockVerifyPassword(true);

      await expect(
        AuthService.login({ email: "nakes@test.com", password: PLAIN_PASSWORD })
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe("token validity after login", () => {
    it("token signed with current JWT_SECRET can be verified", async () => {
      mockFindByEmail(makeUser());
      mockVerifyPassword(true);

      const result = await AuthService.login({
        email: "nakes@test.com",
        password: PLAIN_PASSWORD,
      });

      const payload = await authUtils.verifyToken(result.access_token);
      expect(payload).not.toBeNull();
    });

    it("token is invalid when verified with a different secret", async () => {
      mockFindByEmail(makeUser());
      mockVerifyPassword(true);

      const result = await AuthService.login({
        email: "nakes@test.com",
        password: PLAIN_PASSWORD,
      });

      process.env.JWT_SECRET = "completely-different-secret-32chars-xyz!";
      const payload = await authUtils.verifyToken(result.access_token);
      expect(payload).toBeNull();
    });
  });
});

describe("AuthError", () => {
  it("is an instance of Error", () => {
    const err = new AuthError(401, "test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AuthError);
  });

  it("carries the correct statusCode and message", () => {
    const err401 = new AuthError(401, "unauthorized");
    expect(err401.statusCode).toBe(401);
    expect(err401.message).toBe("unauthorized");

    const err403 = new AuthError(403, "forbidden");
    expect(err403.statusCode).toBe(403);
    expect(err403.message).toBe("forbidden");
  });
});

// ─── Integration-style: loginSchema (validator shape) ────────────────────────

describe("loginSchema", () => {
  it("accepts a valid email and password", async () => {
    const { loginSchema } = await import("@/src/server/validators/auth.validator");
    const result = loginSchema.safeParse({ email: "a@b.com", password: "pw" });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", async () => {
    const { loginSchema } = await import("@/src/server/validators/auth.validator");
    const result = loginSchema.safeParse({ email: "not-an-email", password: "pw" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", async () => {
    const { loginSchema } = await import("@/src/server/validators/auth.validator");
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing password field", async () => {
    const { loginSchema } = await import("@/src/server/validators/auth.validator");
    const result = loginSchema.safeParse({ email: "a@b.com" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing email field", async () => {
    const { loginSchema } = await import("@/src/server/validators/auth.validator");
    const result = loginSchema.safeParse({ password: "pw" });
    expect(result.success).toBe(false);
  });
});
