-- ==========================================
-- SCREENINGS CONSTRAINTS
-- ==========================================

-- Age must be between 0 and 60 months
ALTER TABLE screenings
ADD CONSTRAINT screenings_age_months_check
CHECK (age_months BETWEEN 0 AND 60);

-- Height must be greater than zero
ALTER TABLE screenings
ADD CONSTRAINT screenings_height_cm_check
CHECK (height_cm > 0);


-- ==========================================
-- SCREENINGS LOCATION CONSTRAINT
-- ==========================================

ALTER TABLE screenings
ADD CONSTRAINT screenings_location_source_check
CHECK (
    (
        location_source = 'GPS'
        AND location IS NOT NULL
        AND manual_region_code IS NULL
    )
    OR
    (
        location_source = 'MANUAL'
        AND location IS NULL
        AND manual_region_code IS NOT NULL
    )
);


-- ==========================================
-- USERS CONSTRAINT
-- ==========================================

ALTER TABLE users
ADD CONSTRAINT users_work_region_check
CHECK (
    (
        role = 'ADMIN'
        AND work_region_code IS NULL
    )
    OR
    (
        role = 'NAKES'
        AND work_region_code IS NOT NULL
    )
);


-- ==========================================
-- SYNC LOGS CONSTRAINT
-- ==========================================

ALTER TABLE sync_logs
ADD CONSTRAINT sync_logs_entity_reference_check
CHECK (
    (
        entity_type = 'CHILD'
        AND screening_id IS NULL
    )
    OR
    (
        entity_type = 'SCREENING'
        AND child_id IS NULL
    )
);