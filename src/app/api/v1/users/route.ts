import { NextRequest } from "next/server";
import { role, ADMIN_ROLES } from "@/src/lib/api-middleware";
import {
  apiResponse,
  errorResponse,
  paginatedResponse,
  parseQueryParams,
  parseSortParam,
} from "@/src/lib/api-utils";
import { createNakesSchema } from "@/src/server/validators";
import { UserService, UserError } from "@/src/server/services";

// GET /api/v1/users — paginated list of NAKES accounts (Admin only)
export const GET = role(ADMIN_ROLES, async (req: NextRequest) => {
  const { page, limit, sort, search } = parseQueryParams(req);

  const searchValue =
    typeof search === "string" ? search : (search as { value?: string } | undefined)?.value;

  const orderBy = parseSortParam(sort, { createdAt: "desc" });

  const result = await UserService.listNakes({
    page,
    limit,
    sort: orderBy,
    search: searchValue,
  });

  return paginatedResponse(result.data, result.total, result.page, result.limit);
});

// POST /api/v1/users — create a new NAKES account (Admin only)
export const POST = role(ADMIN_ROLES, async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body permintaan tidak valid", 400);
  }

  const parsed = createNakesSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      rule: issue.code,
      field: issue.path.join("."),
      message: issue.message,
    }));
    return errorResponse("Validasi gagal", 422, errors);
  }

  try {
    const account = await UserService.createNakes(parsed.data);
    return apiResponse(account, "Akun berhasil dibuat", 201);
  } catch (err) {
    if (err instanceof UserError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("[POST /api/v1/users]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
