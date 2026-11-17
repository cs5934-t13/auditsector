import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countTags,
  countTagsIn,
  reportsWithTag,
  resolveTagName,
  resolveTagNameIn,
  tagIndex,
  tagPath,
  tagSlug,
} from '../src/utils/tags.ts'
import { SEED_TAG_NAMES } from '../src/content/tags.ts'

const REPORTS = [
  {
    id: 1,
    date: '2026-12-01',
    tags: ['Information Technology', 'Regulatory Compliance'],
  },
  {
    id: 2,
    date: '2026-08-20',
    tags: ['Regulatory Compliance'],
  },
  {
    id: 3,
    date: '2026-08-15',
    tags: ['Fixed Assets', 'Capital Projects'],
  },
]

test('tagSlug lowercases and hyphenates', () => {
  assert.equal(tagSlug('Information Technology'), 'information-technology')
  assert.equal(tagSlug('Regulatory   Compliance'), 'regulatory-compliance')
})

test('tagSlug strips punctuation, edge hyphens, and diacritics', () => {
  assert.equal(tagSlug('  Capital Projects!  '), 'capital-projects')
  assert.equal(tagSlug('Sécurité & Privacy'), 'securite-privacy')
})

test('tagPath builds the /tag/<slug> URL', () => {
  assert.equal(tagPath('Fixed Assets'), '/tag/fixed-assets')
})

test('countTags counts each report once per tag and sorts by count then name', () => {
  assert.deepEqual(countTags(REPORTS), [
    { name: 'Regulatory Compliance', reportCount: 2 },
    { name: 'Capital Projects', reportCount: 1 },
    { name: 'Fixed Assets', reportCount: 1 },
    { name: 'Information Technology', reportCount: 1 },
  ])
})

test('countTags ignores repeated occurrences within one report', () => {
  assert.deepEqual(
    countTags([{ tags: ['Fixed Assets', 'Fixed Assets', 'Capital Projects'] }]),
    [
      { name: 'Capital Projects', reportCount: 1 },
      { name: 'Fixed Assets', reportCount: 1 },
    ],
  )
})

test('resolveTagName accepts the slug or the display name', () => {
  const tags = countTags(REPORTS)

  assert.equal(
    resolveTagName(tags, 'information-technology'),
    'Information Technology',
  )
  assert.equal(
    resolveTagName(tags, 'Information%20Technology'),
    'Information Technology',
  )
  assert.equal(resolveTagName(tags, 'nope'), undefined)
  assert.equal(resolveTagName(tags, ''), undefined)
})

test('reportsWithTag returns matching reports newest first', () => {
  assert.deepEqual(
    reportsWithTag(REPORTS, 'Regulatory Compliance').map((report) => report.id),
    [1, 2],
  )
  assert.deepEqual(
    reportsWithTag(REPORTS, 'Fixed Assets').map((report) => report.id),
    [3],
  )
})

test('SEED_TAG_NAMES is the agreed seed set, in order', () => {
  assert.deepEqual(SEED_TAG_NAMES, [
    'Inventory',
    'Fixed Assets',
    'Payroll and Benefits',
    'Accounts Receivable',
    'Accounts Payable and Vendors',
    'Human Resources',
    'Capital Projects',
    'Grant Oversight',
    'Information Technology',
    'Regulatory Compliance',
  ])
})

test('every seed tag has a unique, non-empty slug', () => {
  const slugs = SEED_TAG_NAMES.map(tagSlug)
  assert.equal(new Set(slugs).size, SEED_TAG_NAMES.length)
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/)
  }
})

test('countTagsIn keeps canonical order and reports zero for untagged tags', () => {
  const counted = countTagsIn(SEED_TAG_NAMES, REPORTS)

  assert.equal(counted.length, SEED_TAG_NAMES.length)
  assert.deepEqual(counted.filter(({ reportCount }) => reportCount > 0), [
    { name: 'Fixed Assets', reportCount: 1 },
    { name: 'Capital Projects', reportCount: 1 },
    { name: 'Information Technology', reportCount: 1 },
    { name: 'Regulatory Compliance', reportCount: 2 },
  ])
  assert.deepEqual(
    counted.find(({ name }) => name === 'Inventory'),
    { name: 'Inventory', reportCount: 0 },
  )
})

test('tagIndex keeps seed order then appends unknown report tags', () => {
  const reports = [
    ...REPORTS,
    { id: 4, date: '2026-07-01', tags: ['Zoning', 'Inventory'] },
  ]
  const indexed = tagIndex(SEED_TAG_NAMES, reports)

  // Seed tags first, in their declared order...
  assert.deepEqual(
    indexed.slice(0, SEED_TAG_NAMES.length).map(({ name }) => name),
    [...SEED_TAG_NAMES],
  )
  // ...then tags that only exist on a report, alphabetically.
  assert.deepEqual(
    indexed.slice(SEED_TAG_NAMES.length).map(({ name }) => name),
    ['Zoning'],
  )
  assert.deepEqual(indexed.at(-1), { name: 'Zoning', reportCount: 1 })
})

test('tagIndex dedupes a report tag that only differs in casing', () => {
  const reports = [{ id: 1, date: '2026-01-01', tags: ['inventory'] }]
  const indexed = tagIndex(SEED_TAG_NAMES, reports)

  assert.equal(indexed.filter(({ name }) => tagSlug(name) === 'inventory').length, 1)
})

test('resolveTagNameIn validates against a canonical list', () => {
  assert.equal(
    resolveTagNameIn(SEED_TAG_NAMES, 'accounts-payable-and-vendors'),
    'Accounts Payable and Vendors',
  )
  assert.equal(resolveTagNameIn(SEED_TAG_NAMES, 'Payroll%20and%20Benefits'), 'Payroll and Benefits')
  assert.equal(resolveTagNameIn(SEED_TAG_NAMES, 'made-up-tag'), undefined)
})

test('resolveTagName accepts a tag added after the seed list', () => {
  const tags = tagIndex(SEED_TAG_NAMES, [
    { id: 1, date: '2026-01-01', tags: ['Zoning'] },
  ])

  assert.equal(resolveTagName(tags, 'zoning'), 'Zoning')
  assert.equal(resolveTagName(tags, 'inventory'), 'Inventory')
  assert.equal(resolveTagName(tags, 'not-a-tag'), undefined)
})
