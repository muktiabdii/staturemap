import { Worker } from "bullmq";
import { redis } from "@/src/lib/redis";
import type { RegionResolutionJob } from "@/src/server/queues/region-resolution.queue";

// TODO: implement SpatialRepository and SyncLogRepository, then fill this worker
export const regionResolutionWorker = new Worker<RegionResolutionJob>(
  "region-resolution",
  async (job) => {
    const { screeningId, syncLogId, latitude, longitude } = job.data;
    console.error(`[worker] Processing job ${job.id}: screening=${screeningId} syncLog=${syncLogId} lat=${latitude} lon=${longitude}`);
    // 1. SpatialRepository.resolveRegion(latitude, longitude) → regionCode | null
    // 2. Update screenings: resolved_region_code, region_resolution_status
    // 3. Update sync_logs: processing_status, error_code
  },
  { connection: redis }
);
