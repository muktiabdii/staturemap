import { BaseRepository } from "@/src/server/repositories/base.repository";

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
}
