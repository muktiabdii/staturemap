import { z } from "zod/v4";

export const getAdminSyncLogQuerySchema = z.object({
  entity_type: z.enum(["CHILD", "SCREENING"], {
    error: "entity_type harus CHILD atau SCREENING",
  }).optional(),
  receipt_status: z.enum(
    ["ACCEPTED", "ALREADY_RECEIVED", "REJECTED", "CONFLICT"],
    { error: "receipt_status tidak valid" }
  ).optional(),
  processing_status: z.enum(
    ["NOT_REQUIRED", "PENDING", "PROCESSING", "COMPLETED", "FAILED"],
    { error: "processing_status tidak valid" }
  ).optional(),
  submitted_by_user_id: z.uuid({ error: "submitted_by_user_id harus berupa UUID" }).optional(),
  from: z.iso.date({ error: "Format from tidak valid (YYYY-MM-DD)" }).optional(),
  to: z.iso.date({ error: "Format to tidak valid (YYYY-MM-DD)" }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type GetAdminSyncLogQuery = z.infer<typeof getAdminSyncLogQuerySchema>;
