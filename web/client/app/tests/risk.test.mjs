import assert from 'node:assert/strict'
import test from 'node:test'
import {
  averageRiskScore,
  averageRiskScoreOfCounts,
  compareRiskLevels,
  countRiskLevels,
  emptyRiskCounts,
  highRiskCount,
  normalizeRiskLevel,
  riskRank,
  riskScore,
  sumRiskCounts,
  totalRiskCounts,
} from '../src/utils/risk.ts'

test('riskScore runs 1..5 in severity order', () => {
  assert.equal(riskScore('INFO'), 1)
  assert.equal(riskScore('LOW'), 2)
  assert.equal(riskScore('MEDIUM'), 3)
  assert.equal(riskScore('HIGH'), 4)
  assert.equal(riskScore('CRITICAL'), 5)
})

test('riskRank sorts unrated below INFO', () => {
  assert.equal(riskRank(null), 0)
  assert.equal(riskRank(undefined), 0)
  assert.equal(riskRank('INFO'), 1)
})

test('compareRiskLevels orders by severity, unrated first', () => {
  const levels = ['CRITICAL', 'LOW', null, 'HIGH', 'INFO', 'MEDIUM']
  assert.deepEqual([...levels].sort(compareRiskLevels), [
    null,
    'INFO',
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL',
  ])
})

test('normalizeRiskLevel accepts casing, long form, and rejects junk', () => {
  assert.equal(normalizeRiskLevel('critical'), 'CRITICAL')
  assert.equal(normalizeRiskLevel(' Low '), 'LOW')
  assert.equal(normalizeRiskLevel('informational'), 'INFO')
  assert.equal(normalizeRiskLevel('INFO'), 'INFO')
  assert.equal(normalizeRiskLevel(null), null)
  assert.equal(normalizeRiskLevel(undefined), null)
  assert.equal(normalizeRiskLevel(''), null)
  assert.equal(normalizeRiskLevel('SEVERE'), null)
  assert.equal(normalizeRiskLevel(5), null)
})

test('countRiskLevels counts each level and tracks unrated separately', () => {
  const { counts, unrated } = countRiskLevels([
    { riskLevel: 'HIGH' },
    { riskLevel: 'high' },
    { riskLevel: 'INFO' },
    { riskLevel: null },
    {},
  ])

  assert.deepEqual(counts, { INFO: 1, LOW: 0, MEDIUM: 0, HIGH: 2, CRITICAL: 0 })
  assert.equal(unrated, 2)
})

test('countRiskLevels of an empty list is all zeros', () => {
  assert.deepEqual(countRiskLevels([]), { counts: emptyRiskCounts(), unrated: 0 })
})

test('sumRiskCounts adds per-level counts together', () => {
  const total = sumRiskCounts([
    { INFO: 1, LOW: 0, MEDIUM: 2, HIGH: 0, CRITICAL: 0 },
    { INFO: 0, LOW: 3, MEDIUM: 0, HIGH: 1, CRITICAL: 1 },
  ])

  assert.deepEqual(total, { INFO: 1, LOW: 3, MEDIUM: 2, HIGH: 1, CRITICAL: 1 })
  assert.equal(totalRiskCounts(total), 8)
  assert.equal(highRiskCount(total), 2)
})

test('averageRiskScoreOfCounts weights levels by score and ignores unrated', () => {
  // (1*1 + 5*1) / 2 = 3
  assert.equal(
    averageRiskScoreOfCounts({ INFO: 1, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 1 }),
    3,
  )
  assert.equal(
    averageRiskScoreOfCounts({ INFO: 0, LOW: 2, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }),
    2,
  )
})

test('averageRiskScoreOfCounts returns null when nothing is rated', () => {
  assert.equal(averageRiskScoreOfCounts(emptyRiskCounts()), null)
})

test('averageRiskScore skips null rows and averages the rest', () => {
  assert.equal(
    averageRiskScore([{ riskLevel: 'HIGH' }, { riskLevel: null }, { riskLevel: 'LOW' }]),
    3,
  )
  assert.equal(averageRiskScore([{ riskLevel: null }]), null)
  assert.equal(averageRiskScore([]), null)
})
