type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

function getAuthHeaders(token?: string | null): Record<string, string> {
  const t = token ?? getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function buildQueryString(params: Record<string, unknown>): string {
  const parts: string[] = [];
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === "search" && typeof value === "object") {
      const { fields, value: searchVal } = value as { fields: string; value: string };
      if (searchVal) parts.push(`search[${fields}]=${encodeURIComponent(searchVal)}`);
    } else if (key === "filter" && typeof value === "object") {
      Object.entries(value as Record<string, Record<string, unknown>>).forEach(
        ([field, ops]) => {
          Object.entries(ops).forEach(([op, val]) => {
            if (val !== undefined && val !== null && val !== "") {
              parts.push(`${field}[${op}]=${encodeURIComponent(String(val))}`);
            }
          });
        }
      );
    } else {
      parts.push(`${key}=${encodeURIComponent(String(value))}`);
    }
  });
  return parts.join("&");
}

async function request<T = unknown>(
  url: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {}, params } = options;

  let fullUrl = url.startsWith("/") ? url : `/${url}`;
  if (params) {
    const qs = buildQueryString(params);
    if (qs) fullUrl += `?${qs}`;
  }

  const response = await fetch(fullUrl, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...headers,
    },
    ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.message || errorData.error || `Request failed with status ${response.status}`
    ) as Error & { status: number; data: unknown };
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

async function requestFormData<T = unknown>(
  url: string,
  formData: FormData,
  method = "POST"
): Promise<T> {
  const fullUrl = url.startsWith("/") ? url : `/${url}`;
  const response = await fetch(fullUrl, {
    method,
    body: formData,
    headers: { ...getAuthHeaders() },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(
      errorData.message || `Request failed with status ${response.status}`
    ) as Error & { status: number; data: unknown };
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

export const api = {
  get: <T = unknown>(url: string, params?: Record<string, unknown>) =>
    request<T>(url, { params }),

  post: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body }),

  put: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: "PUT", body }),

  patch: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body }),

  delete: <T = unknown>(url: string) =>
    request<T>(url, { method: "DELETE" }),

  upload: <T = unknown>(url: string, formData: FormData, method?: string) =>
    requestFormData<T>(url, formData, method),
};
