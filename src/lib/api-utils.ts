import { NextRequest, NextResponse } from "next/server";

export function apiResponse<T>(data: T, message = "OK", statusCode = 200) {
  return NextResponse.json(
    { data, message, statusCode },
    { status: statusCode }
  );
}

export class ValidationError extends Error {
  public errors: { rule: string; field: string; message: string }[];
  constructor(errors: { rule: string; field: string; message: string }[]) {
    super("Validasi gagal");
    this.name = "ValidationError";
    this.errors = errors;
  }
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
  message = "OK"
) {
  const lastPage = Math.ceil(total / perPage);
  return NextResponse.json({
    data,
    page,
    total,
    perPage,
    lastPage,
    nextPage: page < lastPage ? page + 1 : null,
    previousPage: page > 1 ? page - 1 : null,
    statusCode: 200,
    message,
  });
}

export function errorResponse(
  message: string,
  statusCode = 400,
  errors?: { rule: string; field: string; message: string }[]
) {
  return NextResponse.json(
    { message, statusCode, ...(errors ? { errors } : {}) },
    { status: statusCode }
  );
}

export function parseQueryParams(req: NextRequest) {
  const url = req.nextUrl;
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const sort = url.searchParams.get("sort") || undefined;

  let search: string | { fields: string; value: string } | undefined =
    url.searchParams.get("search") || undefined;
  url.searchParams.forEach((value, key) => {
    const searchMatch = key.match(/^search\[(.+)\]$/);
    if (searchMatch) {
      const [, fields] = searchMatch;
      search = { fields, value };
    }
  });

  const filter: Record<string, Record<string, unknown>> = {};
  url.searchParams.forEach((value, key) => {
    const match = key.match(/^(.+)\[(.+)\]$/);
    if (match) {
      const [, field, operator] = match;
      if (field === "search") return;
      if (!filter[field]) filter[field] = {};
      filter[field][operator] = value;
    }
  });

  return {
    page,
    limit,
    sort,
    search,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  };
}

export function parseSortParam(
  sort: string | undefined,
  defaultSort: Record<string, "asc" | "desc"> = { createdAt: "desc" }
): Record<string, "asc" | "desc"> {
  if (!sort) return defaultSort;
  if (sort.startsWith("-")) return { [toCamelCase(sort.slice(1))]: "desc" };
  return { [toCamelCase(sort)]: "asc" };
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function parseFilterConditions(
  filter: Record<string, Record<string, unknown>> | undefined
): Record<string, unknown> {
  if (!filter) return {};

  const conditions: Record<string, unknown> = {};
  Object.entries(filter).forEach(([field, operators]) => {
    const camelField = toCamelCase(field);
    Object.entries(operators).forEach(([op, value]) => {
      switch (op) {
        case "eq": conditions[camelField] = value; break;
        case "ne": conditions[camelField] = { not: value }; break;
        case "gt": conditions[camelField] = { gt: value }; break;
        case "gte": conditions[camelField] = { gte: value }; break;
        case "lt": conditions[camelField] = { lt: value }; break;
        case "lte": conditions[camelField] = { lte: value }; break;
        case "contains": conditions[camelField] = { contains: value as string, mode: "insensitive" }; break;
        case "in": conditions[camelField] = { in: value }; break;
      }
    });
  });
  return conditions;
}

export function buildSearchCondition(
  search: string | undefined,
  fields: string[]
): Record<string, unknown> | undefined {
  if (!search || !fields.length) return undefined;
  return {
    OR: fields.map((field) => ({
      [toCamelCase(field)]: { contains: search, mode: "insensitive" },
    })),
  } as Record<string, unknown>;
}

export function softDeleteFilter() {
  return { deletedAt: null };
}
