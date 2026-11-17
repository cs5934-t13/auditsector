/**
 * Seed tags for audit reports.
 *
 * These are the tags the database is seeded with (`data/scripts/init_audits.sql`
 * creates a flat `tags` table whose `name` is `VARCHAR(100) NOT NULL UNIQUE`).
 *
 * The tag set is OPEN, not closed: users will be able to add and remove tags
 * later. So this file is the *initial* set and the display reference, not a
 * whitelist that rejects anything else. Concretely:
 *
 * 1. Initial tags — seeds the tags index and the report tag picker before the
 *    backend has data of its own.
 * 2. Display order — the order below is the order shown on the `/tags` index,
 *    following business domains (assets, revenue, spending, people, programs,
 *    technology, compliance) rather than the alphabet. Tags added later sort
 *    after these, alphabetically.
 * 3. Display casing — links and headings use these exact strings, so
 *    "Payroll and Benefits" is never rendered as "payroll and benefits".
 *
 * A report may therefore carry a tag that is not listed here; the UI renders
 * and links it like any other. Only the seed tags are guaranteed to exist
 * before any reports do.
 *
 * TODO: Replace with `GET /tags` once the backend exposes the tag table, and
 * keep this list as the seed used when that request fails.
 */
export const SEED_TAGS = {
  inventory: 'Inventory',
  fixedAssets: 'Fixed Assets',
  payrollAndBenefits: 'Payroll and Benefits',
  accountsReceivable: 'Accounts Receivable',
  accountsPayableAndVendors: 'Accounts Payable and Vendors',
  humanResources: 'Human Resources',
  capitalProjects: 'Capital Projects',
  grantOversight: 'Grant Oversight',
  informationTechnology: 'Information Technology',
  regulatoryCompliance: 'Regulatory Compliance',
} as const;

/** Union of the seed tag names. NOT a whitelist; see the file comment. */
export type SeedTag = (typeof SEED_TAGS)[keyof typeof SEED_TAGS];

/** Seed tags in display order. */
export const SEED_TAG_NAMES: readonly SeedTag[] = [
  SEED_TAGS.inventory,
  SEED_TAGS.fixedAssets,
  SEED_TAGS.payrollAndBenefits,
  SEED_TAGS.accountsReceivable,
  SEED_TAGS.accountsPayableAndVendors,
  SEED_TAGS.humanResources,
  SEED_TAGS.capitalProjects,
  SEED_TAGS.grantOversight,
  SEED_TAGS.informationTechnology,
  SEED_TAGS.regulatoryCompliance,
];
