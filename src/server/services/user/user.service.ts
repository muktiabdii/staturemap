import { UserRepository } from "@/src/server/repositories";
import { RegionRepository } from "@/src/server/repositories";
import { hashPassword } from "@/src/lib/auth-utils";
import { isUniqueViolation } from "@/src/lib/utils";
import type { CreateNakesInput, UpdateNakesInput } from "@/src/server/validators/user.validator";
import type { NakesAccount } from "@/src/server/repositories/user/user.repository";
import type { PaginatedResult } from "@/src/server/repositories/base.repository";

const userRepo = new UserRepository();
const regionRepo = new RegionRepository();

export class UserError extends Error {
  constructor(
    public readonly statusCode: 400 | 404 | 409 | 422,
    message: string
  ) {
    super(message);
    this.name = "UserError";
  }
}

export class UserService {
  
  /** Paginated list of NAKES accounts with optional name/email search. */
  static async listNakes(options: {
    page: number;
    limit: number;
    sort?: Record<string, "asc" | "desc">;
    search?: string;
  }): Promise<PaginatedResult<NakesAccount>> {
    const where: Record<string, unknown> = {};
    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
      ];
    }
    return userRepo.findManyNakes({ ...options, where });
  }

  /** Get a single NAKES account by userId. Throws 404 if not found. */
  static async getNakes(userId: string): Promise<NakesAccount> {
    const user = await userRepo.findNakesById(userId);
    if (!user) throw new UserError(404, "Akun tidak ditemukan");
    return user;
  }

  /** Create a new NAKES account. Role is always NAKES, never from input. */
  static async createNakes(input: CreateNakesInput): Promise<NakesAccount> {
    const region = await UserService.requireVillageRegion(input.work_region_code);
    const passwordHash = await hashPassword(input.password);
    try {
      return await userRepo.createNakes({
        name: input.name,
        email: input.email,
        passwordHash,
        workRegionId: region.id,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new UserError(409, "Email sudah digunakan");
      }
      throw err;
    }
  }

  /** Update mutable fields of a NAKES account. Partial — only provided fields change. */
  static async updateNakes(
    userId: string,
    input: UpdateNakesInput
  ): Promise<NakesAccount> {
    const existing = await userRepo.findNakesById(userId);
    if (!existing) throw new UserError(404, "Akun tidak ditemukan");

    const data: {
      name?: string;
      email?: string;
      passwordHash?: string;
      workRegionId?: string;
    } = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.password !== undefined) data.passwordHash = await hashPassword(input.password);
    if (input.work_region_code !== undefined) {
      const region = await UserService.requireVillageRegion(input.work_region_code);
      data.workRegionId = region.id;
    }

    try {
      return await userRepo.updateNakes(userId, data);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new UserError(409, "Email sudah digunakan");
      }
      throw err;
    }
  }

  /**
   * Deactivate a NAKES account (set accountStatus = INACTIVE).
   * Idempotent: deactivating an already-INACTIVE account returns it as-is.
   * Re-activation is not supported (account lifecycle is one-way per domain-rules.md §4).
   */
  static async deactivateNakes(userId: string): Promise<NakesAccount> {
    const existing = await userRepo.findNakesById(userId);
    if (!existing) throw new UserError(404, "Akun tidak ditemukan");

    // Already inactive — no-op, idempotent
    if (existing.accountStatus === "INACTIVE") return existing;

    return userRepo.deactivateNakes(userId);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Looks up a region by code and validates it is VILLAGE level. */
  private static async requireVillageRegion(regionCode: string) {
    const region = await regionRepo.findByCode(regionCode);
    if (!region) {
      throw new UserError(422, `Kode wilayah '${regionCode}' tidak ditemukan`);
    }
    if (region.regionLevel !== "VILLAGE") {
      throw new UserError(
        422,
        `Wilayah kerja harus berlevel VILLAGE, bukan ${region.regionLevel}`
      );
    }
    return region;
  }
}
