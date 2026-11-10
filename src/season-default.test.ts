import { describe, expect, it } from 'vitest'
import { seasonForDate } from './season-default.ts'

describe('season preset by date (AC54)', () => {
  it.each([
    ['2026-10-01', ['winter']],
    ['2026-11-10', ['winter']],
    ['2027-01-15', ['winter']],
    ['2027-03-31', ['winter']],
    ['2027-04-01', ['sommer']],
    ['2027-07-20', ['sommer']],
    ['2027-09-30', ['sommer']],
  ])('%s → %j', (day, expected) => {
    expect(seasonForDate(new Date(`${day}T12:00:00`))).toEqual(expected)
  })
})
