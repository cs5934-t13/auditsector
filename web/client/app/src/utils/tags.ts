/**
 * Tag helpers.
 *
 * Kept dependency-free and free of app data so the logic can be unit-tested
 * directly and reused by both the data layer and the router.
 *
 * Tag pages live at `/tag/<tagname>`. Tag text can contain spaces, punctuation,
 * diacritics, and mixed case, so links use a slug — lowercase words joined by
 * hyphens — and the page applies the same normalization to the incoming route
 * segment. That keeps one canonical URL per tag and lets a hand-typed
 * `/tag/Information%20Technology` resolve to the same page.
 */

/** A tag with the number of distinct reports that carry it. */
export interface TagCount {
  name: string;
  reportCount: number;
}

/** Minimal shape the helpers need from a report. */
export interface TaggedReport {
  tags: readonly string[];
}

/**
 * Converts a tag name into its canonical URL segment.
 *
 * Example: `"Information Technology"` becomes `"information-technology"`.
 */
export function tagSlug(name: string): string {
  return name
    .normalize('NFKD')
    // Strip combining marks so "Sécurité" and "securite" share one URL.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Builds the canonical URL for a tag, e.g. `/tag/information-technology`. */
export function tagPath(name: string): string {
  return `/tag/${tagSlug(name)}`;
}

/**
 * Distinct tags across `reports`, ordered by report count (descending) then
 * name. A report contributes at most once to each tag's count.
 */
export function countTags<T extends TaggedReport>(
  reports: readonly T[],
): readonly TagCount[] {
  const counts = countTagOccurrences(reports);

  return [...counts.entries()]
    .map(([name, reportCount]) => ({ name, reportCount }))
    .sort(
      (a, b) => b.reportCount - a.reportCount || a.name.localeCompare(b.name),
    );
}

/** Tallies reports per tag, counting each report at most once per tag. */
function countTagOccurrences<T extends TaggedReport>(
  reports: readonly T[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const report of reports) {
    for (const tag of new Set(report.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * Every tag in `names`, in that order, with its report count.
 *
 * Unlike `countTags`, this does not derive the tag list from the reports, so
 * tags with no matching reports still appear (with `reportCount: 0`). Pass a
 * canonical list to get a stable, complete index; derive from reports when the
 * tag set is open.
 */
export function countTagsIn<T extends TaggedReport>(
  names: readonly string[],
  reports: readonly T[],
): readonly TagCount[] {
  const counts = countTagOccurrences(reports);

  return names.map((name) => ({
    name,
    reportCount: counts.get(name) ?? 0,
  }));
}

/**
 * Builds the tag index for an open tag set: the tags known up front (`seeded`)
 * in their given order, followed by any tag found only on `reports`, sorted
 * alphabetically.
 *
 * This is the right helper when tags can be added at runtime. `countTagsIn`
 * alone would hide a newly added tag until it appears on a report, and
 * `countTags` alone would lose the deliberate ordering of the seeded tags.
 */
export function tagIndex<T extends TaggedReport>(
  seeded: readonly string[],
  reports: readonly T[],
): readonly TagCount[] {
  const counts = countTagOccurrences(reports);

  const seededSlugs = new Set(seeded.map(tagSlug));
  const extra = [...counts.keys()]
    .filter((name) => !seededSlugs.has(tagSlug(name)))
    .sort((a, b) => a.localeCompare(b));

  return [...seeded, ...extra].map((name) => ({
    name,
    reportCount: counts.get(name) ?? 0,
  }));
}

/**
 * Resolves a URL segment to a tag's display name.
 *
 * Accepts either the canonical slug (`information-technology`) or the original
 * name (`Information Technology`), so hand-typed URLs still resolve.
 */
export function resolveTagName(
  tags: readonly TagCount[],
  segment: string,
): string | undefined {
  return resolveTagNameIn(tags.map(({ name }) => name), segment);
}

/**
 * Resolves a URL segment to one of `names`.
 *
 * Same matching rules as `resolveTagName`, but takes plain names rather than
 * counted tags, so callers validating against a canonical list do not need to
 * build counts first.
 */
export function resolveTagNameIn(
  names: readonly string[],
  segment: string,
): string | undefined {
  const wanted = tagSlug(decodeURIComponent(segment));
  if (!wanted) {
    return undefined;
  }

  return names.find((name) => tagSlug(name) === wanted);
}

/** Reports carrying `name`, newest first (by ISO `date`). */
export function reportsWithTag<T extends TaggedReport & { date: string }>(
  reports: readonly T[],
  name: string,
): readonly T[] {
  const wanted = tagSlug(name);

  return reports
    .filter((report) => report.tags.some((tag) => tagSlug(tag) === wanted))
    .sort((a, b) => b.date.localeCompare(a.date));
}
