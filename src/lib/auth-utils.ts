import { SignJWT, jwtVerify } from "jose";
import { hash, verify, argon2id } from "argon2";

export type JwtPayload = {
  sub: string;
  email?: string;
  role?: string;
  workRegionCode?: string | null;
  iat?: number;
  exp?: number;
};

/**
 * Returns the JWT signing secret as a Uint8Array.
 * Throws at call-time (not at import) if JWT_SECRET is missing,
 * so build steps that import this module without a full env still succeed.
 */
function getSecret(): Uint8Array {
  const raw = process.env.JWT_SECRET;
  if (!raw) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(raw);
}

const DEFAULT_EXPIRES_IN = "7d";

export async function signToken(
  payload: Omit<JwtPayload, "iat" | "exp">
): Promise<string> {
  const expiresIn = process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN;
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

/**
 * Verifies a JWT and returns its payload.
 * Returns null for any invalid token (expired, bad signature, malformed, missing sub).
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    if (typeof payload.sub !== "string" || !payload.sub) return null;

    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Argon2id options — OWASP recommended minimum:
 *   memoryCost: 64 MiB (65536 KiB), timeCost: 3, parallelism: 4.
 * The argon2 package defaults already match these values; they are stated
 * explicitly here so the intent is clear and auditable.
 */
const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

/** Hashes a plaintext password using Argon2id. Returns a PHC-format string. */
export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against a stored Argon2 hash.
 * Returns true if they match, false otherwise.
 */
export async function verifyPassword(
  storedHash: string,
  plaintext: string
): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext);
  } catch {
    return false;
  }
}
