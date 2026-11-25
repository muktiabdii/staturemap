import { NextRequest } from "next/server";
import { loginSchema } from "@/src/server/validators";
import { AuthService, AuthError } from "@/src/server/services";
import { apiResponse, errorResponse } from "@/src/lib/api-utils";

// POST /api/v1/auth/login
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body permintaan tidak valid", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      rule: issue.code,
      field: issue.path.join("."),
      message: issue.message,
    }));
    return errorResponse("Validasi gagal", 422, errors);
  }

  try {
    const result = await AuthService.login(parsed.data);
    return apiResponse(result, "Login berhasil");
  } catch (err) {
    if (err instanceof AuthError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("[POST /api/v1/auth/login]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
}
