-- ==========================================
-- RESTORE users_work_region_check
-- Rule: ADMIN must have work_region_id IS NULL;
--       NAKES must have work_region_id IS NOT NULL.
-- Replaces the old constraint that referenced the dropped column work_region_code.
-- ==========================================

ALTER TABLE "users"
ADD CONSTRAINT "users_work_region_check"
CHECK (
    (role = 'ADMIN' AND work_region_id IS NULL)
    OR
    (role = 'NAKES' AND work_region_id IS NOT NULL)
);


-- ==========================================
-- RESTORE screenings_location_source_check
-- Rule: GPS  → location NOT NULL, manual_region_id IS NULL.
--       MANUAL → location IS NULL,  manual_region_id IS NOT NULL.
-- Replaces the old constraint that referenced the dropped column manual_region_code.
-- ==========================================

ALTER TABLE "screenings"
ADD CONSTRAINT "screenings_location_source_check"
CHECK (
    (location_source = 'GPS'    AND location IS NOT NULL AND manual_region_id IS NULL)
    OR
    (location_source = 'MANUAL' AND location IS NULL     AND manual_region_id IS NOT NULL)
);
