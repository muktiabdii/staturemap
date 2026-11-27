import { ChildRepository, RegionRepository } from "@/src/server/repositories";
import type { AuthUser } from "@/src/lib/api-middleware";
import type { ChildPullItem, PullCursor } from "@/src/server/repositories/child/child.repository";

const childRepo = new ChildRepository();
const regionRepo = new RegionRepository();

// Number of records returned per pull page
const PULL_LIMIT = 50;

export type PullResult = {
  data: ChildPullItem[];
  next_cursor: string | null;
  has_more: boolean;
};

export class PullService {
  /**
   * Returns a page of Child records for the authenticated Nakes's work region.
   *
   * Cursor is an opaque base64url string that encodes { updatedAt, childId }.
   * Passing null or an empty string triggers an initial (full) sync from the
   * beginning of the dataset.
   *
   * Returns `has_more: true` and a `next_cursor` when there are further pages.
   * Returns `has_more: false` and `next_cursor: null` when the page is the last.
   */
  static async pull(authUser: AuthUser, rawCursor: string | null): Promise<PullResult> {
    if (!authUser.workRegionCode) {
      return { data: [], next_cursor: null, has_more: false };
    }

    // Resolve work region UUID from the authenticated user's region code
    const region = await regionRepo.findByCode(authUser.workRegionCode);
    if (!region) {
      return { data: [], next_cursor: null, has_more: false };
    }

    // Decode cursor — invalid cursor is treated as initial sync (null)
    const cursor = PullService.decodeCursor(rawCursor);

    // Fetch one extra record to detect whether a next page exists
    const rows = await childRepo.findForPull(region.id, cursor, PULL_LIMIT + 1);

    const hasMore = rows.length > PULL_LIMIT;
    const page = hasMore ? rows.slice(0, PULL_LIMIT) : rows;

    // Build the next cursor from the last item in the returned page
    const lastItem = page[page.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? PullService.encodeCursor({ updatedAt: lastItem.updated_at, childId: lastItem.child_id })
        : null;

    return {
      data: page,
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  // ─── Cursor encoding ─────────────────────────────────────────────────────

  /**
   * Encodes a cursor position as an opaque base64url string.
   * The encoded value is not signed — it is opaque but not tamper-proof.
   * Clients cannot infer structure from it; malformed values are silently
   * treated as initial sync (see decodeCursor).
   */
  static encodeCursor(cursor: PullCursor): string {
    const json = JSON.stringify(cursor);
    return Buffer.from(json, "utf8").toString("base64url");
  }

  /**
   * Decodes a cursor string. Returns null for any invalid input so that
   * a malformed cursor is treated as an initial sync rather than an error.
   * This prevents clients from triggering unbounded or unexpected queries
   * by passing arbitrary cursor values.
   */
  static decodeCursor(raw: string | null | undefined): PullCursor | null {
    if (!raw) return null;
    try {
      const json = Buffer.from(raw, "base64url").toString("utf8");
      const parsed = JSON.parse(json) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>).updatedAt !== "string" ||
        typeof (parsed as Record<string, unknown>).childId !== "string"
      ) {
        return null;
      }
      const { updatedAt, childId } = parsed as PullCursor;
      
      // Validate that updatedAt parses to a real date to prevent bad SQL params
      if (isNaN(new Date(updatedAt).getTime())) return null;
      return { updatedAt, childId };
    } catch {
      return null;
    }
  }
}
