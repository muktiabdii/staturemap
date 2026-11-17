import { Queue } from "bullmq";
import { redis } from "@/src/lib/redis";

export type RegionResolutionJob = {
  screeningId: string;
  syncLogId: string;
  latitude: number;
  longitude: number;
};

export const regionResolutionQueue = new Queue<RegionResolutionJob>(
  "region-resolution",
  { connection: redis }
);
