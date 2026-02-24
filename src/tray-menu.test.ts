import { describe, expect, it } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import { buildTrayMenuModel, toStrikethroughLabel } from './tray-menu.js'

describe('buildTrayMenuModel', () => {
  it('returns error menu when fetching failed', () => {
    const result = buildTrayMenuModel(undefined, { error: true })
    expect(result[0]).toEqual({ kind: 'error', label: '取得失敗' })
    expect(result.some((item) => item.kind === 'refresh')).toBe(true)
  })

  it('shows empty state when no payload items', () => {
    const result = buildTrayMenuModel({
      count: 0,
      items: [],
      updatedAt: '2026-02-16T00:00:00.000Z'
    })
    expect(result[0]).toEqual({ kind: 'summary', label: '今日のタスク: 0件' })
    expect(result[1]).toEqual({ kind: 'empty', label: 'タスクはありません' })
  })

  it('includes all task items with due labels', () => {
    const result = buildTrayMenuModel({
      count: 2,
      items: [
        {
          id: '1',
          title: '買い物',
          completed: false,
          dueDateIso: '2026-02-16',
          hasRecurrence: true,
          recurrenceLabel: '月,水'
        },
        { id: '2', title: '連絡', completed: true, dueDateIso: '2026-02-17' }
      ],
      updatedAt: '2026-02-16T00:00:00.000Z'
    }, { today: Temporal.PlainDate.from('2026-02-16') })
    const tasks = result.filter((item) => item.kind === 'task')
    expect(tasks).toEqual([
      {
        kind: 'task',
        todoId: '1',
        label: '買い物',
        completed: false,
        sublabel: '📅 今日  🔄 月,水'
      },
      {
        kind: 'task',
        todoId: '2',
        label: toStrikethroughLabel('連絡'),
        completed: true,
        sublabel: '📅 明日'
      }
    ])
  })
})
