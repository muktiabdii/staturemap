import { UserRepository } from "@/src/server/repositories";
import { verifyPassword, signToken } from "@/src/lib/auth-utils";
import { ACCOUNT_STATUS, USER_ROLES } from "@/src/constants/common";
import type { LoginInput } from "@/src/server/validators/auth.validator";

const userRepo = new UserRepository();

// Sent back on successful login
export type LoginResult = {
  access_token: string;
  expires_at: string; // ISO-8601
  user: {
    user_id: string;
    name: string;
    email: string;
    role: string;
    work_region_code: string | null;
  };
};

// Typed error thrown to route handler — avoids leaking internals in catch-all
export class AuthError extends Error {
  constructor(
    public readonly statusCode: 401 | 403,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export class AuthService {
  static async login(input: LoginInput): Promise<LoginResult> {
    const user = await userRepo.findByEmail(input.email);

    // Use identical response for "not found" and "wrong password" (no user enumeration)
    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      throw new AuthError(401, "Email atau password salah");
    }

    if (user.accountStatus === ACCOUNT_STATUS.INACTIVE) {
      throw new AuthError(403, "Akun tidak aktif");
    }

    // Derive work_region_code from the authenticated record — never trust client input
    const workRegionCode = AuthService.resolveWorkRegionCode(user);

    const token = await signToken({
      sub: user.userId,
      email: user.email,
      role: user.role,
      workRegionCode,
    });

    // Decode the token to get the actual exp set by signToken, so expires_at
    // is always consistent with what was signed regardless of JWT_EXPIRES_IN.
    const expiresAt = AuthService.expiresAtFromToken(token);

    return {
      access_token: token,
      expires_at: expiresAt,
      user: {
        user_id: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        work_region_code: workRegionCode,
      },
    };
  }

  /**
   * Returns the VILLAGE-level region code for NAKES, or null for ADMIN.
   * Throws if a NAKES account has no work region or region is not VILLAGE-level.
   */
  private static resolveWorkRegionCode(user: {
    role: string;
    workRegion: { regionCode: string; regionLevel: string } | null;
  }): string | null {
    if (user.role === USER_ROLES.ADMIN) return null;

    if (!user.workRegion) {
      throw new AuthError(403, "Akun Nakes tidak memiliki wilayah kerja");
    }

    if (user.workRegion.regionLevel !== "VILLAGE") {
      throw new AuthError(403, "Wilayah kerja Nakes harus berlevel VILLAGE");
    }

    return user.workRegion.regionCode;
  }

  /** Extract `exp` from the JWT payload (without verification) for the response body. */
  private static expiresAtFromToken(token: string): string {
    try {
      const payloadB64 = token.split(".")[1];
      const decoded = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
      if (typeof decoded.exp === "number") {
        return new Date(decoded.exp * 1000).toISOString();
      }
    } catch {
      // fall through to fallback
    }
    // Fallback: 7 days from now — should never be reached in practice
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
}
