import { BaseRepository } from "@/src/server/repositories/base.repository";
import type { PaginatedResult, PaginationOptions } from "@/src/server/repositories/base.repository";

// Minimal shape returned by findByEmail — only the fields login needs
export type UserForAuth = {
  userId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  accountStatus: string;
  workRegionId: string | null;
  workRegion: { regionCode: string; regionLevel: string } | null;
};

// Shape returned by findById — no passwordHash needed for middleware
export type UserForMiddleware = {
  userId: string;
  name: string;
  email: string;
  role: string;
  accountStatus: string;
  workRegion: { regionCode: string } | null;
};

// Shape for account management responses — safe to expose to Admin
export type NakesAccount = {
  userId: string;
  name: string;
  email: string;
  role: string;
  accountStatus: string;
  workRegionId: string | null;
  workRegion: { id: string; regionCode: string; regionName: string; regionLevel: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

const NAKES_SELECT = {
  userId: true,
  name: true,
  email: true,
  role: true,
  accountStatus: true,
  workRegionId: true,
  workRegion: {
    select: { id: true, regionCode: true, regionName: true, regionLevel: true },
  },
  createdAt: true,
  updatedAt: true,
};

export class UserRepository extends BaseRepository {
  protected modelName = "user";

  /**
   * Find a user by email, including workRegion for JWT claim derivation.
   * Returns only the fields required for authentication.
   */
  async findByEmail(email: string): Promise<UserForAuth | null> {
    return this.model.findUnique({
      where: { email },
      select: {
        userId: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        accountStatus: true,
        workRegionId: true,
        workRegion: {
          select: {
            regionCode: true,
            regionLevel: true,
          },
        },
      },
    }) as Promise<UserForAuth | null>;
  }

  /**
   * Find a user by userId for middleware identity resolution.
   * Does not return passwordHash.
   */
  async findById(userId: string): Promise<UserForMiddleware | null> {
    return this.model.findUnique({
      where: { userId },
      select: {
        userId: true,
        name: true,
        email: true,
        role: true,
        accountStatus: true,
        workRegion: {
          select: { regionCode: true },
        },
      },
    }) as Promise<UserForMiddleware | null>;
  }

  /** Paginated list of NAKES accounts. Supports search on name/email. */
  async findManyNakes(
    options: Omit<PaginationOptions, "where"> & { where?: Record<string, unknown> }
  ): Promise<PaginatedResult<NakesAccount>> {
    const where = { role: "NAKES", ...(options.where ?? {}) };
    const result = await this.findMany({
      ...options,
      where,
      select: NAKES_SELECT,
    });
    return result as unknown as PaginatedResult<NakesAccount>;
  }

  /** Find a single NAKES account by userId. Returns null if not found or not NAKES. */
  async findNakesById(userId: string): Promise<NakesAccount | null> {
    return this.model.findUnique({
      where: { userId, role: "NAKES" },
      select: NAKES_SELECT,
    }) as Promise<NakesAccount | null>;
  }

  /** Create a new NAKES account. */
  async createNakes(data: {
    name: string;
    email: string;
    passwordHash: string;
    workRegionId: string;
  }): Promise<NakesAccount> {
    return this.model.create({
      data: { ...data, role: "NAKES", accountStatus: "ACTIVE" },
      select: NAKES_SELECT,
    }) as Promise<NakesAccount>;
  }

  /** Update mutable fields of a NAKES account. */
  async updateNakes(
    userId: string,
    data: {
      name?: string;
      email?: string;
      passwordHash?: string;
      workRegionId?: string;
    }
  ): Promise<NakesAccount> {
    return this.model.update({
      where: { userId },
      data,
      select: NAKES_SELECT,
    }) as Promise<NakesAccount>;
  }

  /** Set account_status to INACTIVE (soft deactivation). */
  async deactivateNakes(userId: string): Promise<NakesAccount> {
    return this.model.update({
      where: { userId },
      data: { accountStatus: "INACTIVE" },
      select: NAKES_SELECT,
    }) as Promise<NakesAccount>;
  }
}
