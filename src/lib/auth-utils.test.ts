import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
} from "./auth-utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

// ─── Password ─────────────────────────────────────────────────────────────────

describe("hashPassword", () => {
  it("produces a non-empty string", async () => {
    const h = await hashPassword("my-secret");
    expect(typeof h).toBe("string");
    expect(h.length).toBeGreaterThan(0);
  });

  it("produces an Argon2id PHC string", async () => {
    const h = await hashPassword("my-secret");
    expect(h.startsWith("$argon2id$")).toBe(true);
  });

  it("hash is not identical to the plaintext", async () => {
    const plaintext = "my-secret";
    const h = await hashPassword(plaintext);
    expect(h).not.toBe(plaintext);
  });

  it("produces a different hash on each call (random salt)", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toBe(h2);
  });
});

describe("verifyPassword", () => {
  it("returns true for the correct password", async () => {
    const h = await hashPassword("correct-password");
    const result = await verifyPassword(h, "correct-password");
    expect(result).toBe(true);
  });

  it("returns false for an incorrect password", async () => {
    const h = await hashPassword("correct-password");
    const result = await verifyPassword(h, "wrong-password");
    expect(result).toBe(false);
  });

  it("returns false for an empty password against a valid hash", async () => {
    const h = await hashPassword("non-empty");
    const result = await verifyPassword(h, "");
    expect(result).toBe(false);
  });

  it("returns false when given a malformed hash string", async () => {
    const result = await verifyPassword("not-a-valid-hash", "anything");
    expect(result).toBe(false);
  });
});

// ─── JWT ─────────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-secret-that-is-long-enough-for-hs256-32chars!";

describe("signToken / verifyToken", () => {
  beforeEach(() => {
    setEnv("JWT_SECRET", TEST_SECRET);
  });

  afterEach(() => {
    setEnv("JWT_SECRET", TEST_SECRET); // restore after any test that modifies it
  });

  describe("signToken", () => {
    it("returns a non-empty JWT string", async () => {
      const token = await signToken({ sub: "user-1" });
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // header.payload.signature
    });

    it("throws when JWT_SECRET is not set", async () => {
      setEnv("JWT_SECRET", undefined);
      await expect(signToken({ sub: "user-1" })).rejects.toThrow(
        "JWT_SECRET environment variable is not set"
      );
    });
  });

  describe("verifyToken — valid tokens", () => {
    it("verifies a freshly signed token and returns the payload", async () => {
      const token = await signToken({ sub: "user-abc" });
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe("user-abc");
    });

    it("preserves the role claim", async () => {
      const token = await signToken({ sub: "user-1", role: "ADMIN" });
      const payload = await verifyToken(token);
      expect(payload?.role).toBe("ADMIN");
    });

    it("preserves the workRegionCode claim", async () => {
      const token = await signToken({
        sub: "user-2",
        role: "NAKES",
        workRegionCode: "35.07.13.2001",
      });
      const payload = await verifyToken(token);
      expect(payload?.workRegionCode).toBe("35.07.13.2001");
    });

    it("preserves a null workRegionCode for ADMIN", async () => {
      const token = await signToken({
        sub: "user-3",
        role: "ADMIN",
        workRegionCode: null,
      });
      const payload = await verifyToken(token);
      expect(payload?.workRegionCode).toBeNull();
    });

    it("preserves the email claim", async () => {
      const token = await signToken({
        sub: "user-4",
        email: "test@example.com",
      });
      const payload = await verifyToken(token);
      expect(payload?.email).toBe("test@example.com");
    });
  });

  describe("verifyToken — invalid tokens", () => {
    it("returns null for a token signed with a different secret", async () => {
      setEnv("JWT_SECRET", "first-secret-long-enough-for-hs256-aaaaaa");
      const token = await signToken({ sub: "user-1" });

      setEnv("JWT_SECRET", "second-secret-long-enough-for-hs256-bbbbbb");
      const payload = await verifyToken(token);
      expect(payload).toBeNull();
    });

    it("returns null for a malformed token string", async () => {
      const payload = await verifyToken("not.a.jwt");
      expect(payload).toBeNull();
    });

    it("returns null for an empty string", async () => {
      const payload = await verifyToken("");
      expect(payload).toBeNull();
    });

    it("returns null for a token with a tampered payload", async () => {
      const token = await signToken({ sub: "user-1" });
      // Replace the payload section with a base64-encoded forgery
      const [header, , signature] = token.split(".");
      const fakePayload = Buffer.from(
        JSON.stringify({ sub: "user-999", role: "ADMIN" })
      )
        .toString("base64url");
      const tampered = `${header}.${fakePayload}.${signature}`;
      const payload = await verifyToken(tampered);
      expect(payload).toBeNull();
    });

    it("returns null for an expired token", async () => {
      // Build a token with exp set 60 seconds in the past using a numeric timestamp
      const { SignJWT } = await import("jose");
      const secret = new TextEncoder().encode(TEST_SECRET);
      const expiredToken = await new SignJWT({ sub: "user-1" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(secret);
      const payload = await verifyToken(expiredToken);
      expect(payload).toBeNull();
    });

    it("returns null when JWT_SECRET is not set during verification", async () => {
      const token = await signToken({ sub: "user-1" });
      setEnv("JWT_SECRET", undefined);
      const payload = await verifyToken(token);
      expect(payload).toBeNull();
    });

    it("returns null for a token missing the sub claim", async () => {
      // Manually craft a token without sub using signToken workaround:
      // sign with a payload that has sub, then strip it at payload level
      // — instead, build a raw token via SignJWT to omit sub entirely
      const { SignJWT } = await import("jose");
      const secret = new TextEncoder().encode(TEST_SECRET);
      const tokenWithoutSub = await new SignJWT({ role: "ADMIN" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(secret);
      const payload = await verifyToken(tokenWithoutSub);
      expect(payload).toBeNull();
    });
  });
});
