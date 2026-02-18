import { Temporal } from '@js-temporal/polyfill'
import { formatDueDateIsoForMenu } from './date-format.js'

export type TodayTaskItem = {
  id: string
  title: string
  completed: boolean
  dueDateIso?: string
}

export type TodayTasksPayload = {
  count: number
  items: TodayTaskItem[]
  updatedAt: string
}

export type TrayMenuModelEntry =
  | { kind: 'summary'; label: string }
  | { kind: 'task'; label: string; completed: boolean; sublabel?: string; todoId: string }
  | { kind: 'overflow'; label: string }
  | { kind: 'empty'; label: string }
  | { kind: 'error'; label: string }
  | { kind: 'separator' }
  | { kind: 'open'; label: string }
  | { kind: 'refresh'; label: string }
  | { kind: 'quit'; label: string }

export const buildTrayMenuModel = (
  payload: TodayTasksPayload | undefined,
  options: { error?: boolean; today?: Temporal.PlainDate } = {}
): TrayMenuModelEntry[] => {
  if (options.error) {
    return [
      { kind: 'error', label: '取得失敗' },
      { kind: 'separator' },
      { kind: 'open', label: 'ウィンドウを開く' },
      { kind: 'refresh', label: '再読み込み' },
      { kind: 'separator' },
      { kind: 'quit', label: '終了' }
    ]
  }

  if (!payload) {
    return [
      { kind: 'summary', label: '今日のタスク: 0件' },
      { kind: 'empty', label: 'タスクはありません' },
      { kind: 'separator' },
      { kind: 'open', label: 'ウィンドウを開く' },
      { kind: 'refresh', label: '再読み込み' },
      { kind: 'separator' },
      { kind: 'quit', label: '終了' }
    ]
  }

  const itemEntries =
    payload.items.length === 0
      ? [{ kind: 'empty', label: 'タスクはありません' } satisfies TrayMenuModelEntry]
      : payload.items.map(
          (todo) =>
            ({
              kind: 'task',
              todoId: todo.id,
              label: todo.title,
              completed: todo.completed,
              sublabel: formatDueDateIsoForMenu(todo.dueDateIso, options.today)
            }) satisfies TrayMenuModelEntry
        )

  return [
    { kind: 'summary', label: `今日のタスク: ${payload.count}件` },
    ...itemEntries,
    { kind: 'separator' },
    { kind: 'open', label: 'ウィンドウを開く' },
    { kind: 'refresh', label: '再読み込み' },
    { kind: 'separator' },
    { kind: 'quit', label: '終了' }
  ]
}
