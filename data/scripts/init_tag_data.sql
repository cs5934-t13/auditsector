-- Seed the tag set, with the tagging rule for each tag.
--
-- These are the initial tags every fresh database starts with. They match the
-- business domains the audits are grouped by, and the same list is mirrored in
-- the client at `web/client/app/src/content/tags.ts` (`SEED_TAGS`) so the UI
-- can render the index before the backend has data.
--
-- `description` is the *inclusion* rule: what a report must substantially
-- examine to carry the tag. `boundary` is the *exclusion* rule: what nearby
-- topic does NOT qualify on its own, and which other tag to use instead. They
-- are stored separately so the UI can label both halves rather than presenting
-- one undifferentiated paragraph.
--
-- The set is OPEN: users will be able to add and remove tags later, so this is
-- a starting point, not a closed enum.
--
-- This statement must be re-runnable AND must update rows that already exist.
-- Plain `INSERT IGNORE` is not enough: it skips a tag that is already present,
-- so a database seeded before these rules existed would keep NULL text forever.
-- `ON DUPLICATE KEY UPDATE` relies on `tags.name` being UNIQUE and refreshes
-- the guidance while leaving `tag_id` (and therefore every `audit_tags` link)
-- untouched. Tags a user added are not in this list, so they are never
-- modified.
--
-- Seeding is NOT dummy data, so this runs for every deployment rather than
-- only when LOAD_DUMMY_DATA=true.
INSERT INTO tags (name, description, boundary) VALUES
    (
        'Inventory',
        'Stock, consumable supplies and non-capital small equipment: counts, custody, distribution and safeguarding.',
        'Includes small durable items below the fixed-asset threshold; exclude capital-asset lifecycle planning.'
    ),
    (
        'Fixed Assets',
        'Acquisition, records, maintenance or disposal of capital assets over $5,000, including major infrastructure.',
        'Threshold follows supplied business-process list. Non-capital equipment alone does not qualify. Construction delivery uses Capital Projects.'
    ),
    (
        'Payroll and Benefits',
        'Substantial testing or analysis of pay, timekeeping, leave, benefits or compensation costs, including pay equity and reimbursed payroll costs.',
        'Promotion/hiring decisions alone use Human Resources. Labor-law enforcement alone uses Regulatory Compliance.'
    ),
    (
        'Accounts Receivable',
        'Government billing, receivables, collection controls and money owed to government, including collection through agents.',
        'Exclude private-company customer billing and employee remedies unless government receivables are directly examined.'
    ),
    (
        'Accounts Payable and Vendors',
        'Invoice processing, payment authorization, supplier payments and vendor-file controls.',
        'Grant/aid allocations and payroll are not automatically accounts payable. Contractor mentions or procurement strategy alone do not qualify.'
    ),
    (
        'Human Resources',
        'Hiring, termination, promotion decisions, personnel procedures, employee conduct, investigations and workplace training.',
        'Pay/benefit amounts alone use Payroll and Benefits. Both tags apply when each topic is substantially examined.'
    ),
    (
        'Capital Projects',
        'Planning, prioritization, budgeting, delivery and oversight of major construction or infrastructure projects.',
        'Exclude routine stock and asset-record controls. May overlap Fixed Assets only with evidence for both scopes.'
    ),
    (
        'Grant Oversight',
        'Grant/aid program selection, eligibility, allowable spending, compliance, recipient monitoring and outcomes.',
        'Funding mentions alone do not qualify. Add another process tag only for separate substantial testing.'
    ),
    (
        'Information Technology',
        'IT systems and governance, cybersecurity, logical access, data privacy, surveillance technology and retention controls.',
        'Software use or project/personnel data problems alone do not qualify. Physical door/key controls alone are not IT.'
    ),
    (
        'Regulatory Compliance',
        'Specific laws, regulations or externally mandated standards are an explicit objective or substantial testing focus.',
        'Internal policy or contract testing alone does not qualify. Label scope, including compliant findings; do not infer illegality.'
    ),
    (
        'Credentiality of Employees',
        'Verification that employees hold the licenses, certifications or credentials their role requires, including renewal and tracking controls.',
        'Hiring or promotion decisions alone use Human Resources, and pay effects alone use Payroll and Benefits. A credential program examined as a separate control qualifies.'
    )
AS new
ON DUPLICATE KEY UPDATE
    description = new.description,
    boundary    = new.boundary;
