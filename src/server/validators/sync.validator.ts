import { z } from "zod/v4";

// ─── Child Profile ────────────────────────────────────────────────────────────

export const pushChildSchema = z.object({
  child_id: z.uuid({ error: "child_id harus berupa UUID" }),
  change_id: z.uuid({ error: "change_id harus berupa UUID" }),
  name: z.string().min(1, { error: "Nama wajib diisi" }).max(255),
  date_of_birth: z.iso.date({ error: "Format tanggal tidak valid (YYYY-MM-DD)" }),
  gender: z.enum(["MALE", "FEMALE"], { error: "Gender harus MALE atau FEMALE" }),
  address: z.string().min(1, { error: "Alamat wajib diisi" }),
});

export type PushChildInput = z.infer<typeof pushChildSchema>;

// ─── Screening ────────────────────────────────────────────────────────────────

const locationGpsSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const pushScreeningSchema = z
  .object({
    screening_id: z.uuid({ error: "screening_id harus berupa UUID" }),
    child_id: z.uuid({ error: "child_id harus berupa UUID" }),
    age_months: z
      .number()
      .int({ error: "age_months harus bilangan bulat" })
      .min(0, { error: "age_months minimal 0" })
      .max(60, { error: "age_months maksimal 60" }),
    gender: z.enum(["MALE", "FEMALE"], { error: "Gender harus MALE atau FEMALE" }),
    height_cm: z.number().positive({ error: "height_cm harus bernilai positif" }),
    classification: z.enum(
      ["SEVERELY_STUNTED", "STUNTED", "NORMAL", "TALL"],
      { error: "classification tidak valid" }
    ),
    screened_at: z.iso.datetime({ error: "Format screened_at tidak valid (ISO 8601)" }),
    location_source: z.enum(["GPS", "MANUAL"], { error: "location_source harus GPS atau MANUAL" }),
    // GPS-only: required when location_source = GPS, must be absent for MANUAL
    location: locationGpsSchema.optional(),
    // MANUAL-only: required when location_source = MANUAL, must be absent for GPS
    manual_region_code: z.string().min(1).max(50).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.location_source === "GPS") {
      if (data.location === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["location"],
          message: "GPS: field location wajib diisi",
        });
      }
      if (data.manual_region_code !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["manual_region_code"],
          message: "GPS: manual_region_code harus kosong",
        });
      }
    } else {
      // MANUAL
      if (data.manual_region_code === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["manual_region_code"],
          message: "MANUAL: field manual_region_code wajib diisi",
        });
      }
      if (data.location !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["location"],
          message: "MANUAL: field location harus kosong",
        });
      }
    }
  });

export type PushScreeningInput = z.infer<typeof pushScreeningSchema>;

// ─── Batch wrapper ────────────────────────────────────────────────────────────

export const pushSyncSchema = z.object({
  children: z.array(z.unknown()).max(50, { error: "Maksimal 50 child profile per permintaan" }).default([]),
  screenings: z.array(z.unknown()).max(100, { error: "Maksimal 100 screening per permintaan" }).default([]),
});

export type PushSyncInput = z.infer<typeof pushSyncSchema>;

