import { RegionRepository } from "@/src/server/repositories";
import type { RegionItem } from "@/src/server/repositories/region/region.repository";

const regionRepo = new RegionRepository();

export type RegionsReferenceResult =
  | { upToDate: true }
  | { upToDate: false; version: string; regions: RegionItem[] };

export class RegionService {
  /**
   * Returns reference region data for a Nakes's work region.
   *
   * - If the client's `clientVersion` matches the server's current version,
   *   returns `{ upToDate: true }` — no region list needed.
   * - Otherwise returns the full ancestor chain (PROVINCE → … → VILLAGE)
   *   for the Nakes's work region along with the current server version.
   *
   * `workRegionCode` must be a VILLAGE-level region code derived from the
   * authenticated user's token — never trusted from the request payload.
   */
  static async getReference(
    workRegionCode: string,
    clientVersion: string | null
  ): Promise<RegionsReferenceResult> {
    const serverVersion = await regionRepo.getDataVersion();

    if (!serverVersion) {
      const emptyVersion = "0";
      if (clientVersion === emptyVersion) return { upToDate: true };
      return { upToDate: false, version: emptyVersion, regions: [] };
    }

    if (clientVersion === serverVersion) return { upToDate: true };

    const regions = await regionRepo.findRegionWithAncestors(workRegionCode);
    return { upToDate: false, version: serverVersion, regions };
  }
}
