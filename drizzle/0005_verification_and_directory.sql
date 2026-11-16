-- 0005_verification_and_directory.sql
--
-- 1. Sign-up verification now binds the emailed code to the browser that
--    registered (a ticket) and holds the chosen password until both are
--    presented. See lib/auth/verification.ts.
ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS code_hash text;
ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS pending_password_hash text;
ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS pending_name text;

-- Codes issued before this change used an unsalted SHA-256 and cannot be
-- checked by the new flow. They expire after 10 minutes anyway; anyone in
-- the middle of signing up simply requests a new code.
DELETE FROM email_verifications WHERE used_at IS NULL;

-- 2. Staff can feature public watchlists in the directory.
ALTER TABLE lists ADD COLUMN IF NOT EXISTS featured_at timestamp with time zone;
CREATE INDEX IF NOT EXISTS idx_list_featured ON lists (featured_at) WHERE featured_at IS NOT NULL;

-- 3. Everyone who already has a verified account has been using the product;
--    only accounts created from now on go through the onboarding steps.
UPDATE users SET onboarding_completed_at = created_at
WHERE onboarding_completed_at IS NULL AND email_verified = true;
