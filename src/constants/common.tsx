export const APP_NAME = "StatureMap";

// --- Roles ---
export const USER_ROLES = {
  ADMIN: "ADMIN",
  NAKES: "NAKES",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// --- Account & Record Status ---
export const ACCOUNT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

export const RECORD_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;

// --- Sync: Receipt & Processing Status ---
export const RECEIPT_STATUS = {
  ACCEPTED: "ACCEPTED",
  ALREADY_RECEIVED: "ALREADY_RECEIVED",
  REJECTED: "REJECTED",
  CONFLICT: "CONFLICT",
} as const;

export const PROCESSING_STATUS = {
  NOT_REQUIRED: "NOT_REQUIRED",
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

// --- Region Resolution Status ---
export const REGION_RESOLUTION_STATUS = {
  PENDING: "PENDING",
  RESOLVED: "RESOLVED",
  UNRESOLVED: "UNRESOLVED",
  FAILED: "FAILED",
} as const;

// --- Sync Error Codes ---
export const SYNC_ERROR_CODES = {
  CHILD_INACTIVE: "CHILD_INACTIVE",
  FORBIDDEN_REGION: "FORBIDDEN_REGION",
  QUEUE_ENQUEUE_FAILED: "QUEUE_ENQUEUE_FAILED",
  WORKER_PROCESSING_FAILED: "WORKER_PROCESSING_FAILED",
} as const;

// --- Domain Values ---
export const GENDER = {
  MALE: "MALE",
  FEMALE: "FEMALE",
} as const;

export const CLASSIFICATION = {
  SEVERELY_STUNTED: "SEVERELY_STUNTED",
  STUNTED: "STUNTED",
  NORMAL: "NORMAL",
  TALL: "TALL",
} as const;

export const LOCATION_SOURCE = {
  GPS: "GPS",
  MANUAL: "MANUAL",
} as const;

// --- Pagination ---
export const PAGINATION_DEFAULTS = {
  page: 1,
  limit: 10,
} as const;
