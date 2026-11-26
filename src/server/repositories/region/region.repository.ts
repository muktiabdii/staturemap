import { BaseRepository } from "@/src/server/repositories/base.repository";

export type RegionForValidation = {
  id: string;
  regionCode: string;
  regionName: string;
  regionLevel: string;
};

export class RegionRepository extends BaseRepository {
  protected modelName = "administrativeRegion";

  /** Find a region by its code. Returns null if not found. */
  async findByCode(regionCode: string): Promise<RegionForValidation | null> {
    return this.model.findUnique({
      where: { regionCode },
      select: { id: true, regionCode: true, regionName: true, regionLevel: true },
    }) as Promise<RegionForValidation | null>;
  }
}
