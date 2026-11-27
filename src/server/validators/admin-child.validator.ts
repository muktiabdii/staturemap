import { z } from "zod/v4";

// Query params for GET /admin/children
export const listChildQuerySchema = z.object({
  region_code: z.string().min(1).max(50).optional(),
  record_status: z.enum(["ACTIVE", "INACTIVE"], {
    error: "record_status harus ACTIVE atau INACTIVE",
  }).optional(),
  search: z.string().min(1).max(100).optional(),
});

export type ListChildQuery = z.infer<typeof listChildQuerySchema>;

// Body for PATCH /admin/children/[id]
export const updateChildSchema = z
  .object({
    name: z.string().min(1, { error: "Nama wajib diisi" }).max(255).optional(),
    date_of_birth: z.iso.date({ error: "Format tanggal tidak valid (YYYY-MM-DD)" }).optional(),
    gender: z.enum(["MALE", "FEMALE"], { error: "Gender harus MALE atau FEMALE" }).optional(),
    address: z.string().min(1, { error: "Alamat wajib diisi" }).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.date_of_birth !== undefined ||
      data.gender !== undefined ||
      data.address !== undefined,
    { error: "Minimal satu field harus diisi" }
  );

export type UpdateChildInput = z.infer<typeof updateChildSchema>;
