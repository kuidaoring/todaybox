import { describe, expect, it } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import { formatDueDateIsoForMenu } from './date-format.js'

describe('formatDueDateIsoForMenu', () => {
  const today = Temporal.PlainDate.from('2026-02-16')

  it('returns undefined when value is missing', () => {
    expect(formatDueDateIsoForMenu(undefined, today)).toBeUndefined()
  })

  it('returns undefined when value is invalid', () => {
    expect(formatDueDateIsoForMenu('not-a-date', today)).toBeUndefined()
  })

  it('formats valid value with calendar prefix', () => {
    expect(formatDueDateIsoForMenu('2026-02-16', today)).toBe('📅 今日')
    expect(formatDueDateIsoForMenu('2026-02-17', today)).toBe('📅 明日')
  })
})
