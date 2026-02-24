import { describe, expect, it } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import {
  app,
  buildRecurrenceSetting,
  buildTodayTasksPayload,
  calculateNextDueDateFromRecurrence,
  completeTodoAndMaybeGenerateNext,
  formatRecurrenceLabel,
  formatDueDateLabel,
  formatCountLabel,
  filterTodosByToday,
  getTodayTodosForMenu,
  sortCompletedTodosByRecent,
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

describe('sortCompletedTodosByRecent', () => {
  it('sorts completed todos by completedAt desc and keeps missing completedAt at end', () => {
    const items: Todo[] = [
      {
        id: '1',
        title: 'a',
        completed: true,
        createdAt: instant(1),
        completedAt: instant(1000)
      },
      {
        id: '2',
        title: 'b',
        completed: true,
        createdAt: instant(2),
        completedAt: instant(3000)
      },
      {
        id: '3',
        title: 'c',
        completed: true,
        createdAt: instant(3)
      }
    ]

    const result = sortCompletedTodosByRecent(items)
    expect(result.map((todo) => todo.id)).toEqual(['2', '1', '3'])
  })
})

describe('buildRecurrenceSetting', () => {
  it('builds weekly recurrence from weekdays', () => {
    expect(
      buildRecurrenceSetting({
        recurrenceType: 'weekly',
        weeklyWeekdays: [1, 3, 5],
        monthlyDay: undefined
      })
    ).toEqual({ type: 'weekly', weekdays: [1, 3, 5] })
  })

  it('builds monthly recurrence from day', () => {
    expect(
      buildRecurrenceSetting({
        recurrenceType: 'monthly',
        weeklyWeekdays: [],
        monthlyDay: 31
      })
    ).toEqual({ type: 'monthly', dayOfMonth: 31 })
  })

  it('returns undefined when recurrence is invalid', () => {
    expect(
      buildRecurrenceSetting({
        recurrenceType: 'weekly',
        weeklyWeekdays: [],
        monthlyDay: undefined
      })
    ).toBeUndefined()
  })
})

describe('formatRecurrenceLabel', () => {
  it('formats weekly recurrence as weekday labels', () => {
    expect(formatRecurrenceLabel({ type: 'weekly', weekdays: [1, 3] })).toBe('月,水')
  })

  it('formats monthly recurrence as day number', () => {
    expect(formatRecurrenceLabel({ type: 'monthly', dayOfMonth: 28 })).toBe('28日')
  })
})

describe('calculateNextDueDateFromRecurrence', () => {
  it('calculates next weekly due date from multiple weekdays', () => {
    const completedAt = Temporal.Instant.from('2026-02-16T10:00:00Z') // Mon
    const baseDate = Temporal.PlainDate.from('2026-02-16')
    const result = calculateNextDueDateFromRecurrence(
      { type: 'weekly', weekdays: [1, 3, 5] },
      baseDate
    )
    expect(result?.toString()).toBe('2026-02-18') // Wed
  })

  it('shifts monthly day to month-end when day does not exist', () => {
    const completedAt = Temporal.Instant.from('2026-03-31T10:00:00Z')
    const baseDate = Temporal.PlainDate.from('2026-03-31')
    const result = calculateNextDueDateFromRecurrence(
      { type: 'monthly', dayOfMonth: 31 },
      baseDate
    )
    expect(result?.toString()).toBe('2026-04-30')
  })
})

describe('completeTodoAndMaybeGenerateNext', () => {
  it('generates only once even after reopen and complete again', () => {
    const base: Todo = {
      id: 'base',
      title: 'task',
      completed: false,
      createdAt: instant(1),
      recurrence: { type: 'weekly', weekdays: [1] },
      hasGeneratedNextOccurrence: false
    }

    const firstGenerated = completeTodoAndMaybeGenerateNext(
      base,
      Temporal.Instant.from('2026-02-16T10:00:00Z'),
      Temporal.PlainDate.from('2026-02-16'),
      () => 'next-1'
    )
    expect(firstGenerated?.id).toBe('next-1')
    expect(base.hasGeneratedNextOccurrence).toBe(true)

    // reopen
    base.completed = false
    base.completedAt = undefined

    const secondGenerated = completeTodoAndMaybeGenerateNext(
      base,
      Temporal.Instant.from('2026-02-17T10:00:00Z'),
      Temporal.PlainDate.from('2026-02-17'),
      () => 'next-2'
    )
    expect(secondGenerated).toBeUndefined()
  })

  it('uses dueDate as recurrence base date when provided', () => {
    const base: Todo = {
      id: 'base',
      title: 'task',
      completed: false,
      createdAt: Temporal.Instant.from('2026-02-10T00:00:00Z'),
      dueDate: Temporal.PlainDate.from('2026-02-20'),
      recurrence: { type: 'weekly', weekdays: [1] }, // Mon
      hasGeneratedNextOccurrence: false
    }

    const generated = completeTodoAndMaybeGenerateNext(
      base,
      Temporal.Instant.from('2026-02-16T10:00:00Z'),
      base.dueDate,
      () => 'next-due'
    )
    expect(generated?.dueDate?.toString()).toBe('2026-02-23')
  })

  it('uses createdAt as recurrence base date when dueDate is missing', () => {
    const base: Todo = {
      id: 'base',
      title: 'task',
      completed: false,
      createdAt: Temporal.Instant.from('2026-02-10T00:00:00Z'),
      recurrence: { type: 'weekly', weekdays: [1] }, // Mon
      hasGeneratedNextOccurrence: false
    }

    const baseDate = base.createdAt.toZonedDateTimeISO('UTC').toPlainDate()
    const generated = completeTodoAndMaybeGenerateNext(
      base,
      Temporal.Instant.from('2026-02-16T10:00:00Z'),
      baseDate,
      () => 'next-created'
    )
    expect(generated?.dueDate?.toString()).toBe('2026-02-16')
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

  it('returns 昨日 when due date is yesterday', () => {
    expect(formatDueDateLabel(plainDate('2026-02-10'), today)).toBe('昨日')
  })

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

describe('getTodayTodosForMenu', () => {
  it('returns only today todos with incomplete first', () => {
    const todos: Todo[] = [
      { id: '1', title: 'a', completed: true, createdAt: instant(1), isToday: true },
      { id: '2', title: 'b', completed: false, createdAt: instant(2), isToday: true },
      { id: '3', title: 'c', completed: false, createdAt: instant(3), isToday: false }
    ]

    const result = getTodayTodosForMenu(todos)

    expect(result.map((todo) => todo.id)).toEqual(['2', '1'])
  })
})

describe('buildTodayTasksPayload', () => {
  it('builds payload with due dates, recurrence flags and all today todos', () => {
    const today = plainDate('2026-02-16')
    const todos: Todo[] = [
      {
        id: '1',
        title: 'buy',
        completed: false,
        createdAt: instant(1),
        dueDate: plainDate('2026-02-16'),
        isToday: true,
        recurrence: { type: 'weekly', weekdays: [1, 3] }
      },
      {
        id: '2',
        title: 'done',
        completed: true,
        createdAt: instant(2),
        dueDate: plainDate('2026-02-17'),
        isToday: true
      }
    ]

    const payload = buildTodayTasksPayload(todos, today)

    expect(payload.count).toBe(2)
    expect(payload.items).toEqual([
      {
        id: '1',
        title: 'buy',
        completed: false,
        dueDateIso: '2026-02-16',
        hasRecurrence: true,
        recurrenceLabel: '月,水'
      },
      {
        id: '2',
        title: 'done',
        completed: true,
        dueDateIso: '2026-02-17',
        hasRecurrence: false,
        recurrenceLabel: undefined
      }
    ])
    expect(typeof payload.updatedAt).toBe('string')
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

  it('returns today tasks payload as json', async () => {
    const res = await app.request('http://localhost/api/today')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = await res.json()
    expect(body).toHaveProperty('count')
    expect(body).toHaveProperty('items')
    expect(Array.isArray(body.items)).toBe(true)
  })

  it('renders incomplete list first and completed section header without folding', async () => {
    const res = await app.request('http://localhost/')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('<summary')
    expect(body).toContain('<details class="space-y-2 rounded border border-zinc-300 p-2" name="todo-item"')
    expect(body).not.toContain('未完了（')
    expect(body).toContain('完了（')
  })

  it('opens selected todo as details row', async () => {
    const listRes = await app.request('http://localhost/')
    const listBody = await listRes.text()
    const selectedMatch = listBody.match(/href="\/\?selected=([^"&]+)[^"]*"/)
    expect(selectedMatch).not.toBeNull()
    const selectedId = selectedMatch?.[1] ?? ''

    const res = await app.request(`http://localhost/?selected=${selectedId}`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(
      /<details class="space-y-2 rounded border border-zinc-300 p-2"(?: name="todo-item")? open(?:="")?>/
    )
  })

  it('shows completedAt label for completed todo rows', async () => {
    const res = await app.request('http://localhost/')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('✅ 完了:')
  })

  it('shows createdAt in the same format as completedAt in details', async () => {
    const listRes = await app.request('http://localhost/')
    const listBody = await listRes.text()
    const selectedMatch = listBody.match(/selected=([^"&]+)/)
    expect(selectedMatch).not.toBeNull()
    const selectedId = selectedMatch?.[1] ?? ''

    const res = await app.request(`http://localhost/?selected=${selectedId}`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toMatch(
      /作成:\s*(昨日|今日|明日|\d{1,2}\/\d{1,2}|\d{4}\/\d{1,2}\/\d{1,2}) \d{2}:\d{2}/
    )
  })

  it('shows delete confirmation on detail delete button', async () => {
    const listRes = await app.request('http://localhost/')
    const listBody = await listRes.text()
    const selectedMatch = listBody.match(/selected=([^"&]+)/)
    expect(selectedMatch).not.toBeNull()
    const selectedId = selectedMatch?.[1] ?? ''

    const res = await app.request(`http://localhost/?selected=${selectedId}`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('return confirm(&#39;このタスクを削除しますか？&#39;)')
  })

  it('shows recurrence status badge when recurrence is set', async () => {
    const listRes = await app.request('http://localhost/')
    const listBody = await listRes.text()
    const selectedMatch = listBody.match(/selected=([^"&]+)/)
    expect(selectedMatch).not.toBeNull()
    const selectedId = selectedMatch?.[1] ?? ''

    const form = new URLSearchParams({
      recurrenceType: 'weekly',
      weeklyWeekdays: '1'
    })
    const recurrenceRes = await app.request(
      `http://localhost/todos/${selectedId}/recurrence?selected=${selectedId}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      }
    )
    expect([200, 302]).toContain(recurrenceRes.status)

    const res = await app.request(`http://localhost/?selected=${selectedId}`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('🔄 月')
  })

  it('can toggle completion from summary checkbox-like button without opening details', async () => {
    const listRes = await app.request('http://localhost/')
    const listBody = await listRes.text()
    const toggleMatch = listBody.match(/\/todos\/([^/"?]+)\/toggle\?[^"]*sort=created/)
    expect(toggleMatch).not.toBeNull()
    const todoId = toggleMatch?.[1] ?? ''
    expect(listBody).toContain('aria-label="完了にする"')

    const toggleRes = await app.request(`http://localhost/todos/${todoId}/toggle?sort=created`, {
      method: 'POST'
    })
    expect([200, 302]).toContain(toggleRes.status)

    const afterRes = await app.request('http://localhost/')
    expect(afterRes.status).toBe(200)
    const afterBody = await afterRes.text()
    expect(afterBody).toContain('✅ 完了:')
  })

  it('can toggle today flag from summary pin button without opening details', async () => {
    const listRes = await app.request('http://localhost/')
    const listBody = await listRes.text()
    const todayMatch = listBody.match(/action="\/todos\/([^/"?]+)\/today\?sort=created"[^>]*>/)
    expect(todayMatch).not.toBeNull()
    const todoId = todayMatch?.[1] ?? ''
    const targetSectionPattern = new RegExp(
      `action="/todos/${todoId}/today\\?sort=created"[\\s\\S]*?aria-label="(今日にする|今日解除)"`,
      'm'
    )
    const beforeLabelMatch = listBody.match(targetSectionPattern)
    expect(beforeLabelMatch).not.toBeNull()
    const beforeLabel = beforeLabelMatch?.[1]
    const expectedLabel = beforeLabel === '今日解除' ? '今日にする' : '今日解除'

    const todayRes = await app.request(`http://localhost/todos/${todoId}/today?sort=created`, {
      method: 'POST'
    })
    expect([200, 302]).toContain(todayRes.status)

    const afterRes = await app.request('http://localhost/')
    expect(afterRes.status).toBe(200)
    const afterBody = await afterRes.text()
    expect(afterBody).toMatch(
      new RegExp(`action="/todos/${todoId}/today\\?sort=created"[\\s\\S]*?aria-label="${expectedLabel}"`, 'm')
    )
  })

})
