/**
 * Recent audit report data.
 *
 * TODO: Replace with real data once the backend exposes the report list and
 * tag endpoints. The shapes here mirror what those endpoints are expected to
 * return, so components should not need to change when the data is wired up.
 */
import {
  reportsWithTag,
  resolveTagName,
  tagIndex,
  type TagCount,
} from '../utils/tags';
import { SEED_TAGS, SEED_TAG_NAMES } from './tags';

export interface RecentAudit {
  /** Stable row id; the Data Grid requires one per row. */
  id: number;
  /** ISO `YYYY-MM-DD`, so the column sorts chronologically. */
  date: string;
  title: string;
  /**
   * Tags the report belongs to, in display casing.
   *
   * Deliberately plain `string`, not a union of the seed tags: the tag set is
   * open and users can add tags, so a report may carry a tag that `content/tags.ts`
   * does not list. The seed names are still available as `SEED_TAGS` so this
   * placeholder data reads without repeating string literals.
   */
  tags: readonly string[];
}

/** Placeholder rows, newest first. */
export const RECENT_AUDITS: readonly RecentAudit[] = [
  {
    id: 1,
    date: '2026-12-01',
    title: '2024 Annual Surveillance Technology Usage Review',
    tags: [SEED_TAGS.informationTechnology, SEED_TAGS.regulatoryCompliance],
  },
  {
    id: 2,
    date: '2026-08-20',
    title:
      'Audit of Comcast’s Compliance with Seattle’s Cable Customer Bill of Rights',
    tags: [SEED_TAGS.regulatoryCompliance],
  },
  {
    id: 3,
    date: '2026-08-15',
    title:
      'Asset Management: Strategic and coordinated approach needed to take on City’s long-standing issues',
    tags: [SEED_TAGS.fixedAssets, SEED_TAGS.capitalProjects],
  },
] as const;

/**
 * Every tag with its report count: the seed tags first, in taxonomy order, then
 * any tag that exists only on a report (alphabetically).
 *
 * Deriving the extra tags from the reports keeps the index correct while tags
 * are still open and mutable — a tag added by a user appears as soon as it is
 * attached to a report, without a code change.
 */
export function listTags(): readonly TagCount[] {
  return tagIndex(SEED_TAG_NAMES, RECENT_AUDITS);
}

/**
 * Resolves a `/tag/<segment>` URL segment to a tag's display name.
 *
 * Uses the same open set as `listTags`, so a URL for a tag added after the seed
 * still resolves instead of showing "Tag not found".
 */
export function findTagName(segment: string): string | undefined {
  return resolveTagName(listTags(), segment);
}

/** Reports carrying `name`, newest first. */
export function auditsForTag(name: string): readonly RecentAudit[] {
  return reportsWithTag(RECENT_AUDITS, name);
}
