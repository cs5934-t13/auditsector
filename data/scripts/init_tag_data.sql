-- Seed the tag set.
--
-- These are the initial tags every fresh database starts with. They match the
-- business domains the audits are grouped by, and the same list is mirrored in
-- the client at `web/client/app/src/content/tags.ts` (`SEED_TAGS`) so the UI
-- can render the index before the backend has data.
--
-- The set is OPEN: users will be able to add and remove tags later, so this is
-- a starting point, not a closed enum. It is safe to re-run: `INSERT IGNORE`
-- relies on `tags.name` being UNIQUE, so existing rows (and any tags users have
-- added) are left untouched.
--
-- Seeding is NOT dummy data, so this runs for every deployment rather than
-- only when LOAD_DUMMY_DATA=true.
INSERT IGNORE INTO tags (name) VALUES
    ('Inventory'),
    ('Fixed Assets'),
    ('Payroll and Benefits'),
    ('Accounts Receivable'),
    ('Accounts Payable and Vendors'),
    ('Human Resources'),
    ('Capital Projects'),
    ('Grant Oversight'),
    ('Information Technology'),
    ('Regulatory Compliance');
