import { describe, expect, it } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import {
  app,
  formatDueDateLabel,
  formatCountLabel,
  filterTodosByToday,
  sortTodos,
  splitTodosByCompletion,
  toDueTimestamp,
  type Todo
} from './server.js'

const instant = (ms: number) => Temporal.Instant.fromEpochMilliseconds(ms)
const plainDate = (value: string) => Temporal.PlainDate.from(value)

describe('toDueTimestamp', () => {
  it('returns Infinity for empty or invalid date', () => {
    expect(toDueTimestamp(undefined)).toBe(Number.POSITIVE_INFINITY)
  })

  it('parses YYYY-MM-DD correctly', () => {
    expect(toDueTimestamp(plainDate('2024-01-01'))).toBe(Date.parse('2024-01-01'))
  })
})

describe('splitTodosByCompletion', () => {
  it('splits todos into incomplete and completed', () => {
    const todos: Todo[] = [
      { id: '1', title: 'a', completed: false, createdAt: instant(1) },
      { id: '2', title: 'b', completed: true, createdAt: instant(2) },
      { id: '3', title: 'c', completed: false, createdAt: instant(3) }
    ]

    const { incomplete, completed } = splitTodosByCompletion(todos)

    expect(incomplete.map((todo) => todo.id)).toEqual(['1', '3'])
    expect(completed.map((todo) => todo.id)).toEqual(['2'])
  })
})

describe('sortTodos', () => {
  const base = [
    {
      id: '1',
      title: 'a',
      completed: false,
      createdAt: instant(1),
      dueDate: plainDate('2024-01-02')
    },
    { id: '2', title: 'b', completed: false, createdAt: instant(3), dueDate: undefined },
    {
      id: '3',
      title: 'c',
      completed: false,
      createdAt: instant(2),
      dueDate: plainDate('2024-01-01')
    }
  ]

  it('sorts by createdAt when sort is created', () => {
    const result = sortTodos(base as Todo[], 'created')
    expect(result.map((todo) => todo.id)).toEqual(['1', '3', '2'])
  })

  it('sorts by dueDate when sort is due', () => {
    const result = sortTodos(base as Todo[], 'due')
    expect(result.map((todo) => todo.id)).toEqual(['3', '1', '2'])
  })

  it('keeps items without dueDate at the end', () => {
    const items: Todo[] = [
      { id: '1', title: 'a', completed: false, createdAt: instant(1), dueDate: undefined },
      {
        id: '2',
        title: 'b',
        completed: false,
        createdAt: instant(2),
        dueDate: plainDate('2024-01-01')
      }
    ]
    const result = sortTodos(items, 'due')
    expect(result.map((todo) => todo.id)).toEqual(['2', '1'])
  })
})

describe('formatCountLabel', () => {
  it('formats label with count', () => {
    expect(formatCountLabel('未完了', 0)).toBe('未完了（0）')
    expect(formatCountLabel('完了', 10)).toBe('完了（10）')
  })
})

describe('formatDueDateLabel', () => {
  const today = plainDate('2026-02-11')

  it('returns 今日 when due date is today', () => {
    expect(formatDueDateLabel(plainDate('2026-02-11'), today)).toBe('今日')
  })

  it('returns 明日 when due date is tomorrow', () => {
    expect(formatDueDateLabel(plainDate('2026-02-12'), today)).toBe('明日')
  })

  it('returns MM/DD when due date is in the same year', () => {
    expect(formatDueDateLabel(plainDate('2026-12-03'), today)).toBe('12/3')
  })

  it('returns YYYY/MM/DD when due date is in a different year', () => {
    expect(formatDueDateLabel(plainDate('2027-01-05'), today)).toBe('2027/1/5')
  })
})

describe('filterTodosByToday', () => {
  const todos: Todo[] = [
    { id: '1', title: 'a', completed: false, createdAt: instant(1), isToday: true },
    { id: '2', title: 'b', completed: false, createdAt: instant(2), isToday: false },
    { id: '3', title: 'c', completed: true, createdAt: instant(3) }
  ]

  it('returns all todos when filter is not today', () => {
    expect(filterTodosByToday(todos, '')).toEqual(todos)
  })

  it('returns only today todos when filter is today', () => {
    expect(filterTodosByToday(todos, 'today').map((todo) => todo.id)).toEqual(['1'])
  })

  it('excludes items without isToday when filter is today', () => {
    const result = filterTodosByToday(todos, 'today')
    expect(result.every((todo) => todo.isToday)).toBe(true)
  })
})

describe('app', () => {
  it('renders the main page with query state', async () => {
    const res = await app.request('http://localhost/?filter=today&sort=due')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('todaybox')
    expect(body).toContain('filter=today')
    expect(body).toContain('sort=due')
  })
})
