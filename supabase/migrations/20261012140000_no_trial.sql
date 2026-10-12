-- No free trial (owner decision, 2026-10-12): new shops start with no plan
-- (plan = 'trial', used internally as "no plan yet") and no trial period.
-- They can explore and use the sandbox; Ava answers real customers only after
-- a paid subscription (set by the verified payment webhooks).
alter table public.shops alter column trial_ends_at set default null;
