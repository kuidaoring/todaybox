import { describe, expect, it } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import { formatCompletedAtLabel, formatDueDateIsoForMenu } from './date-format.js'

describe('formatDueDateIsoForMenu', () => {
  const today = Temporal.PlainDate.from('2026-02-16')

  it('returns undefined when value is missing', () => {
    expect(formatDueDateIsoForMenu(undefined, today)).toBeUndefined()
  })

  it('returns undefined when value is invalid', () => {
    expect(formatDueDateIsoForMenu('not-a-date', today)).toBeUndefined()
  })

  it('formats valid value with calendar prefix', () => {
    expect(formatDueDateIsoForMenu('2026-02-15', today)).toBe('📅 昨日')
    expect(formatDueDateIsoForMenu('2026-02-16', today)).toBe('📅 今日')
    expect(formatDueDateIsoForMenu('2026-02-17', today)).toBe('📅 明日')
  })
})

describe('formatCompletedAtLabel', () => {
  it('formats as due-date style plus 24h HH:mm', () => {
    const instant = Temporal.Instant.from('2026-02-16T03:04:00Z')
    const today = Temporal.PlainDate.from('2026-02-16')
    expect(formatCompletedAtLabel(instant, { today, timeZone: 'UTC' })).toBe('今日 03:04')
  })

  it('formats tomorrow without AM/PM', () => {
    const instant = Temporal.Instant.from('2026-02-17T00:09:00Z')
    const today = Temporal.PlainDate.from('2026-02-16')
    expect(formatCompletedAtLabel(instant, { today, timeZone: 'UTC' })).toBe('明日 00:09')
  })

  it('formats yesterday without AM/PM', () => {
    const instant = Temporal.Instant.from('2026-02-15T23:59:00Z')
    const today = Temporal.PlainDate.from('2026-02-16')
    expect(formatCompletedAtLabel(instant, { today, timeZone: 'UTC' })).toBe('昨日 23:59')
  })
})
