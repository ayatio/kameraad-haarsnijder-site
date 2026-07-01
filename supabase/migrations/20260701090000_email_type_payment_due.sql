-- Slice 1 · Mig 1 · email_type_payment_due
-- Adds the two email_type enum values so send-payment-due and eod-reminder can
-- write a correctly-typed email_log row (no untyped/unlogged mail). G-18 / FR-118.
-- Applied to kameraad-staging (hzvhyslujvkwqpkevahj) 2026-07-01.

-- UP
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'payment_due';
ALTER TYPE email_type ADD VALUE IF NOT EXISTS 'eod_reminder';

-- DOWN: Postgres cannot DROP an enum value; reversal is a no-op. To truly revert,
-- recreate the type without the values and re-cast email_log.email_type.
