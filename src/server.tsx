import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { jsxRenderer } from 'hono/jsx-renderer'
import { zValidator } from '@hono/zod-validator'
import { Temporal } from '@js-temporal/polyfill'
import { createTodoFormSchema, dueDateFormSchema, querySchema, recurrenceFormSchema } from './validation.js'
import { formatCompletedAtLabel, formatDueDateLabel } from './date-format.js'

export const app = new Hono()

export type RecurrenceSetting =
  | { type: 'weekly'; weekdays: number[] }
  | { type: 'monthly'; dayOfMonth: number }

export type Todo = {
  id: string
  title: string
  completed: boolean
  createdAt: Temporal.Instant
  completedAt?: Temporal.Instant
  recurrence?: RecurrenceSetting
  hasGeneratedNextOccurrence?: boolean
  dueDate?: Temporal.PlainDate
  isToday?: boolean
  memo?: string
}

export type TodayTaskItem = {
  id: string
  title: string
  completed: boolean
  dueDateIso?: string
  hasRecurrence: boolean
  recurrenceLabel?: string
}

export type TodayTasksPayload = {
  count: number
  items: TodayTaskItem[]
  updatedAt: string
}

const todos: Todo[] = []
const now = Temporal.Now.instant()
const localTimeZone = Temporal.Now.timeZoneId()
const localToday = Temporal.Now.zonedDateTimeISO(localTimeZone).toPlainDate()
const toLocalNoonInstant = (date: Temporal.PlainDate) =>
  date
    .toZonedDateTime({
      timeZone: localTimeZone,
      plainTime: Temporal.PlainTime.from('12:00')
    })
    .toInstant()
const toUtcPlainDate = (value: Temporal.Instant) => value.toZonedDateTimeISO('UTC').toPlainDate()
const formatPlainDateInput = (value: Temporal.PlainDate | undefined) => value?.toString() ?? ''
const todosChangedListeners = new Set<() => void>()
export { formatDueDateLabel } from './date-format.js'

const notifyTodosChanged = () => {
  for (const listener of todosChangedListeners) {
    listener()
  }
}

const recurrenceWeekdayLabels = [
  { value: 0, label: '日' },
  { value: 1, label: '月' },
  { value: 2, label: '火' },
  { value: 3, label: '水' },
  { value: 4, label: '木' },
  { value: 5, label: '金' },
  { value: 6, label: '土' }
] as const
const recurrenceWeekdayLabelMap = new Map<number, string>(
  recurrenceWeekdayLabels.map((item) => [item.value, item.label])
)

export const formatRecurrenceLabel = (recurrence: RecurrenceSetting | undefined) => {
  if (!recurrence) {
    return undefined
  }
  if (recurrence.type === 'monthly') {
    return `${recurrence.dayOfMonth}日`
  }
  const labels = [...new Set(recurrence.weekdays)]
    .sort((a, b) => a - b)
    .map((weekday) => recurrenceWeekdayLabelMap.get(weekday))
    .filter((label): label is string => Boolean(label))
  if (labels.length === 0) {
    return undefined
  }
  return labels.join(',')
}

export const buildRecurrenceSetting = (
  form: {
    recurrenceType: 'none' | 'weekly' | 'monthly'
    weeklyWeekdays: number[]
    monthlyDay?: number
  }
): RecurrenceSetting | undefined => {
  if (form.recurrenceType === 'weekly' && form.weeklyWeekdays.length > 0) {
    return { type: 'weekly', weekdays: form.weeklyWeekdays }
  }
  if (form.recurrenceType === 'monthly' && form.monthlyDay) {
    return { type: 'monthly', dayOfMonth: form.monthlyDay }
  }
  return undefined
}

export const resolveMonthlyDay = (year: number, month: number, dayOfMonth: number) => {
  const yearMonth = Temporal.PlainYearMonth.from({ year, month })
  return Math.min(dayOfMonth, yearMonth.daysInMonth)
}

export const calculateNextDueDateFromRecurrence = (
  recurrence: RecurrenceSetting,
  baseDate: Temporal.PlainDate
) => {
  const base = baseDate
  if (recurrence.type === 'weekly') {
    const currentWeekday = base.dayOfWeek % 7
    const offsets = recurrence.weekdays
      .map((weekday) => {
        const diff = (weekday - currentWeekday + 7) % 7
        return diff === 0 ? 7 : diff
      })
      .sort((a, b) => a - b)
    const nextOffset = offsets[0]
    if (nextOffset === undefined) {
      return undefined
    }
    return base.add({ days: nextOffset })
  }

  const thisMonthDay = resolveMonthlyDay(base.year, base.month, recurrence.dayOfMonth)
  let candidate = Temporal.PlainDate.from({
    year: base.year,
    month: base.month,
    day: thisMonthDay
  })
  if (Temporal.PlainDate.compare(candidate, base) <= 0) {
    const nextMonth = base.add({ months: 1 })
    const nextMonthDay = resolveMonthlyDay(nextMonth.year, nextMonth.month, recurrence.dayOfMonth)
    candidate = Temporal.PlainDate.from({
      year: nextMonth.year,
      month: nextMonth.month,
      day: nextMonthDay
    })
  }
  return candidate
}

export const completeTodoAndMaybeGenerateNext = (
  todo: Todo,
  completedAt: Temporal.Instant = Temporal.Now.instant(),
  baseDate: Temporal.PlainDate = todo.dueDate ??
    todo.createdAt.toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainDate(),
  createId: (createdAt: Temporal.Instant) => string = (createdAt) =>
    `${Number(createdAt.epochMilliseconds)}-${Math.random().toString(36).slice(2, 8)}`
) => {
  todo.completed = true
  todo.completedAt = completedAt

  if (!todo.recurrence || todo.hasGeneratedNextOccurrence) {
    return undefined
  }

  const nextDueDate = calculateNextDueDateFromRecurrence(todo.recurrence, baseDate)
  if (!nextDueDate) {
    return undefined
  }

  const createdAt = Temporal.Now.instant()
  const nextTodo: Todo = {
    id: createId(createdAt),
    title: todo.title,
    completed: false,
    createdAt,
    recurrence: todo.recurrence,
    hasGeneratedNextOccurrence: false,
    dueDate: nextDueDate,
    isToday: false,
    memo: todo.memo
  }
  todo.hasGeneratedNextOccurrence = true
  return nextTodo
}

export const subscribeTodosChanged = (listener: () => void) => {
  todosChangedListeners.add(listener)
  return () => {
    todosChangedListeners.delete(listener)
  }
}

export const getTodayTodosForMenu = (items: Todo[]) => {
  const todayTodos = items.filter((todo) => todo.isToday)
  const incomplete = todayTodos.filter((todo) => !todo.completed)
  const completed = todayTodos.filter((todo) => todo.completed)
  return [...incomplete, ...completed]
}

export const buildTodayTasksPayload = (
  items: Todo[],
  today: Temporal.PlainDate = Temporal.Now.plainDateISO()
): TodayTasksPayload => {
  const todayTodos = getTodayTodosForMenu(items)
  return {
    count: todayTodos.length,
    items: todayTodos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      completed: todo.completed,
      dueDateIso: todo.dueDate?.toString(),
      hasRecurrence: Boolean(todo.recurrence),
      recurrenceLabel: formatRecurrenceLabel(todo.recurrence)
    })),
    updatedAt: new Date().toISOString()
  }
}

// Seed data for local testing.
todos.push(
  {
    id: `seed-${now}-1`,
    title: '買い物に行く',
    completed: false,
    createdAt: now.subtract({ hours: 24 }),
    dueDate: toUtcPlainDate(now.add({ hours: 24 })),
    isToday: true
  },
  {
    id: `seed-${now}-2`,
    title: '請求書を送る',
    completed: false,
    createdAt: now.subtract({ hours: 6 }),
    dueDate: toUtcPlainDate(now.add({ hours: 48 })),
    isToday: false
  },
  {
    id: `seed-${now}-3`,
    title: 'ジムに行く',
    completed: true,
    createdAt: now.subtract({ hours: 12 }),
    completedAt: toLocalNoonInstant(localToday.subtract({ days: 3 })),
    dueDate: toUtcPlainDate(now.subtract({ hours: 24 })),
    isToday: false
  },
  {
    id: `seed-${now}-4`,
    title: '本を読む',
    completed: false,
    createdAt: now.subtract({ minutes: 30 }),
    isToday: false
  },
  {
    id: `seed-${now}-5`,
    title: '部屋を片付ける',
    completed: true,
    createdAt: now.subtract({ hours: 72 }),
    completedAt: toLocalNoonInstant(localToday.subtract({ days: 1 })),
    isToday: false
  }
)

export const toDueTimestamp = (value: Temporal.PlainDate | undefined) => {
  if (!value) {
    return Number.POSITIVE_INFINITY
  }
  return Date.parse(value.toString())
}

export const splitTodosByCompletion = (items: Todo[]) => {
  return {
    incomplete: items.filter((todo) => !todo.completed),
    completed: items.filter((todo) => todo.completed)
  }
}

export const sortTodos = (items: Todo[], sort: 'created' | 'due') => {
  return [...items].sort((a, b) => {
    if (sort === 'due') {
      return toDueTimestamp(a.dueDate) - toDueTimestamp(b.dueDate)
    }
    return Temporal.Instant.compare(a.createdAt, b.createdAt)
  })
}

export const sortCompletedTodosByRecent = (items: Todo[]) => {
  return [...items].sort((a, b) => {
    if (!a.completedAt && !b.completedAt) {
      return Temporal.Instant.compare(a.createdAt, b.createdAt)
    }
    if (!a.completedAt) {
      return 1
    }
    if (!b.completedAt) {
      return -1
    }
    return Temporal.Instant.compare(b.completedAt, a.completedAt)
  })
}

export const formatCountLabel = (label: string, count: number) => {
  return `${label}（${count}）`
}

export const filterTodosByToday = (items: Todo[], filter: string) => {
  return filter === 'today' ? items.filter((todo) => todo.isToday) : items
}

const buildPathWithQuery = (
  path: string,
  baseUrl: string,
  params: Record<string, string | undefined>
) => {
  const basePath = new URL(path, baseUrl).pathname
  const searchParams = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value)
    }
  })
  const query = searchParams.toString()
  return query ? `${basePath}?${query}` : basePath
}

app.use(
  '/assets/*',
  serveStatic({
    root: './dist',
    rewriteRequestPath: (path) => path.replace(/^\/assets/, '')
  })
)

app.get('/api/today', (c) => {
  return c.json(buildTodayTasksPayload(todos))
})

app.get(
  '*',
  jsxRenderer(({ children }) => (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>todaybox</title>
        <link rel="stylesheet" href="/assets/tailwind.css" />
      </head>
      <body className="antialiased">
        <div id="app">{children}</div>
      </body>
    </html>
  ))
)

app.get('/', zValidator('query', querySchema), (c) => {
  const { filter, selected, sort } = c.req.valid('query')
  const filtered = filterTodosByToday(todos, filter)
  const { incomplete, completed } = splitTodosByCompletion(filtered)
  const incompleteTodos = sortTodos(incomplete, sort)
  const completedTodos = sortCompletedTodosByRecent(completed)
  const renderTodoRow = (todo: Todo) => (
    <li className="text-sm">
      <details
        className="space-y-2 rounded border border-zinc-300 p-2"
        name="todo-item"
        open={todo.id === selected ? true : undefined}
      >
        <summary className="flex cursor-pointer flex-wrap items-center gap-2">
          <form
            method="post"
            action={buildPathWithQuery(`/todos/${todo.id}/toggle`, c.req.url, {
              filter,
              selected,
              sort
            })}
            className="inline"
            onclick="event.stopPropagation()"
          >
            <button
              type="submit"
              aria-label={todo.completed ? '未完了に戻す' : '完了にする'}
              aria-pressed={todo.completed ? 'true' : 'false'}
              className={[
                'inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                todo.completed
                  ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'border-zinc-400 bg-white text-transparent hover:border-zinc-500'
              ].join(' ')}
              onclick="event.stopPropagation()"
            >
              ✓
            </button>
          </form>
          <form
            method="post"
            action={buildPathWithQuery(`/todos/${todo.id}/today`, c.req.url, {
              filter,
              selected,
              sort
            })}
            className="inline"
            onclick="event.stopPropagation()"
          >
            <button
              type="submit"
              aria-label={todo.isToday ? '今日解除' : '今日にする'}
              aria-pressed={todo.isToday ? 'true' : 'false'}
              className={[
                'inline-flex h-5 w-5 items-center justify-center rounded border text-[11px] leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
                todo.isToday
                  ? 'border-amber-500 bg-amber-500 text-white hover:bg-amber-400'
                  : 'border-zinc-400 bg-white text-zinc-500 hover:border-zinc-500'
              ].join(' ')}
              onclick="event.stopPropagation()"
            >
              📍
            </button>
          </form>
          <a
            href={buildPathWithQuery('/', c.req.url, {
              filter,
              selected: todo.id,
              sort
            })}
          >
            <span className={todo.completed ? 'line-through' : ''}>{todo.title}</span>
          </a>
          {todo.dueDate ? <small className="text-xs">📅 {formatDueDateLabel(todo.dueDate)}</small> : null}
          {todo.recurrence ? (
            <small className="text-xs">🔄 {formatRecurrenceLabel(todo.recurrence)}</small>
          ) : null}
          {todo.memo ? <small className="text-xs">📝 メモ</small> : null}
          {todo.completedAt ? (
            <small className="text-xs">✅ 完了: {formatCompletedAtLabel(todo.completedAt)}</small>
          ) : null}
        </summary>
        {renderInlineDetails(todo)}
      </details>
    </li>
  )
  const renderInlineDetails = (todo: Todo) => {
    const detailQuery = { filter, selected: todo.id, sort }
    return (
      <div className="space-y-3 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span>締切:</span>
          <form
            method="post"
          action={buildPathWithQuery(`/todos/${todo.id}/due`, c.req.url, detailQuery)}
          className="inline-flex items-center gap-2"
        >
          <input type="date" name="dueDate" value={formatPlainDateInput(todo.dueDate)} />
          <button type="submit">{todo.dueDate ? '締切を更新' : '締切を設定'}</button>
        </form>
        {todo.dueDate ? (
          <form
            method="post"
            action={buildPathWithQuery(`/todos/${todo.id}/due`, c.req.url, detailQuery)}
            className="inline"
          >
            <input type="hidden" name="dueDate" value="" />
            <button type="submit">クリア</button>
          </form>
        ) : null}
      </div>
      <form
        method="post"
        action={buildPathWithQuery(`/todos/${todo.id}/recurrence`, c.req.url, detailQuery)}
        className="space-y-2"
      >
        <fieldset className="flex flex-col gap-3 border border-zinc-300 p-2">
          <legend>繰り返し設定</legend>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="recurrenceType"
              value="none"
              checked={todo.recurrence ? undefined : true}
            />
            <span>繰り返しなし</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="recurrenceType"
                value="weekly"
                checked={todo.recurrence?.type === 'weekly' ? true : undefined}
              />
              <span>週次</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {recurrenceWeekdayLabels.map((day) => (
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    name="weeklyWeekdays"
                    value={String(day.value)}
                    checked={
                      todo.recurrence?.type === 'weekly' && todo.recurrence.weekdays.includes(day.value)
                        ? true
                        : undefined
                    }
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="recurrenceType"
                value="monthly"
                checked={todo.recurrence?.type === 'monthly' ? true : undefined}
              />
              <span>月次</span>
            </label>
            <select name="monthlyDay" className="w-24">
              <option value="">未設定</option>
              {Array.from({ length: 31 }, (_, index) => {
                const day = index + 1
                return (
                  <option
                    value={String(day)}
                    selected={todo.recurrence?.type === 'monthly' && todo.recurrence.dayOfMonth === day}
                  >
                    {day}日
                  </option>
                )
              })}
            </select>
          </div>
          <div>
            <button type="submit">設定</button>
          </div>
        </fieldset>
      </form>
      <div>
        <p>メモ:</p>
        <pre className="whitespace-pre-wrap">{todo.memo || 'なし'}</pre>
      </div>
      {todo.completedAt ? <p>完了: {formatCompletedAtLabel(todo.completedAt)}</p> : null}
      <p>作成: {formatCompletedAtLabel(todo.createdAt)}</p>
      <div className="border-t border-zinc-300 pt-3">
        <form
          method="post"
          action={buildPathWithQuery(`/todos/${todo.id}/delete`, c.req.url, detailQuery)}
          className="inline"
        >
          <button type="submit" onclick="return confirm('このタスクを削除しますか？')">
            削除
          </button>
        </form>
      </div>
      </div>
    )
  }
  return c.render(
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">todaybox</h1>
        <p className="text-sm">今日のタスクや締切を簡単に管理できます。</p>
      </header>
      <nav className="flex flex-wrap items-center gap-3 text-sm">
        <a
          href={buildPathWithQuery('/', c.req.url, { filter: '', selected, sort })}
          className={filter ? '' : 'font-semibold underline'}
          aria-current={filter ? undefined : 'page'}
        >
          すべて
        </a>{' '}
        |{' '}
        <a
          href={buildPathWithQuery('/', c.req.url, { filter: 'today', selected, sort })}
          className={filter === 'today' ? 'font-semibold underline' : ''}
          aria-current={filter === 'today' ? 'page' : undefined}
        >
          今日のタスク
        </a>
      </nav>
      <form method="post" action="/todos" className="flex flex-wrap items-center gap-3 text-sm">
        <input
          type="text"
          name="title"
          placeholder="やること"
          required
          className="min-w-[220px] flex-1"
        />
        <input type="date" name="dueDate" className="shrink-0" />
        <label className="inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            name="isToday"
            checked={filter === 'today'}
            disabled={filter === 'today'}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-400 bg-white text-[11px] leading-none text-zinc-500 transition-colors peer-checked:border-amber-500 peer-checked:bg-amber-500 peer-checked:text-white peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            📍
          </span>
          <span className="sr-only">今日やる</span>
        </label>
        <label className="flex w-full flex-col gap-2">
          <span>メモ</span>
          <textarea name="memo" rows={3} placeholder="補足メモ" className="w-full"></textarea>
        </label>
        <fieldset className="flex w-full flex-col gap-3 border border-zinc-300 p-3">
          <legend>繰り返し</legend>
          <label className="inline-flex items-center gap-2">
            <input type="radio" name="recurrenceType" value="none" checked />
            <span>繰り返しなし</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="recurrenceType" value="weekly" />
              <span>週次</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {recurrenceWeekdayLabels.map((day) => (
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" name="weeklyWeekdays" value={String(day.value)} />
                  {day.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="recurrenceType" value="monthly" />
              <span>月次</span>
            </label>
            <select name="monthlyDay" className="w-24">
              <option value="">未設定</option>
              {Array.from({ length: 31 }, (_, index) => {
                const day = index + 1
                return <option value={String(day)}>{day}日</option>
              })}
            </select>
          </div>
          <p className="text-xs text-zinc-600">
            週次と月次は排他です。完了時に次回タスクを1件生成します。
          </p>
        </fieldset>
        {filter ? <input type="hidden" name="filter" value={filter} /> : null}
        {selected ? <input type="hidden" name="selected" value={selected} /> : null}
        <input type="hidden" name="sort" value={sort} />
        <button type="submit">追加</button>
      </form>
      <div className="grid gap-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">一覧</h2>
            <form method="get" action="/" className="flex items-center gap-2 text-sm">
              <input type="hidden" name="filter" value={filter} />
              {selected ? <input type="hidden" name="selected" value={selected} /> : null}
              <label className="flex items-center gap-2">
                <span>並び替え</span>
                <select name="sort" className="text-sm">
                  <option value="created" selected={sort === 'created'}>
                    作成順
                  </option>
                  <option value="due" selected={sort === 'due'}>
                    期限順
                  </option>
                </select>
              </label>
              <button type="submit">適用</button>
            </form>
          </div>
          {filtered.length ? (
            <div className="space-y-4">
              {incompleteTodos.length ? (
                <ul className="space-y-2">
                  {incompleteTodos.map((todo) => renderTodoRow(todo))}
                </ul>
              ) : null}
              {completedTodos.length ? (
                <div className="space-y-2">
                  <h3 className="text-base font-semibold">{formatCountLabel('完了', completedTodos.length)}</h3>
                  <ul className="space-y-2">
                    {completedTodos.map((todo) => renderTodoRow(todo))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm">タスクがありません。</p>
          )}
        </section>
      </div>
    </main>
  )
})

app.post('/todos', zValidator('form', createTodoFormSchema), (c) => {
  const body = c.req.valid('form')
  const {
    title,
    dueDate,
    memo,
    recurrenceType,
    weeklyWeekdays,
    monthlyDay,
    filter,
    selected,
    sort
  } = body
  const isToday = body.isToday || filter === 'today'
  const recurrence = buildRecurrenceSetting({
    recurrenceType,
    weeklyWeekdays,
    monthlyDay
  })
  if (title) {
    const createdAt = Temporal.Now.instant()
    todos.push({
      id: `${Number(createdAt.epochMilliseconds)}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      completed: false,
      createdAt,
      recurrence,
      hasGeneratedNextOccurrence: false,
      dueDate,
      isToday,
      memo: memo || undefined
    })
    notifyTodosChanged()
  }
  return c.redirect(buildPathWithQuery('/', c.req.url, { filter, selected, sort }))
})

app.post('/todos/:id/toggle', zValidator('query', querySchema), (c) => {
  const id = c.req.param('id')
  const { filter, selected, sort } = c.req.valid('query')
  const todo = todos.find((t) => t.id === id)
  if (todo) {
    todo.completed = !todo.completed
    if (todo.completed) {
      const recurrenceBaseDate =
        todo.dueDate ??
        todo.createdAt.toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainDate()
      const nextTodo = completeTodoAndMaybeGenerateNext(todo, Temporal.Now.instant(), recurrenceBaseDate)
      if (nextTodo) {
        todos.push(nextTodo)
      }
    } else {
      todo.completedAt = undefined
    }
    notifyTodosChanged()
  }
  return c.redirect(buildPathWithQuery('/', c.req.url, { filter, selected, sort }))
})

app.post('/todos/:id/today', zValidator('query', querySchema), (c) => {
  const id = c.req.param('id')
  const { filter, selected, sort } = c.req.valid('query')
  const todo = todos.find((t) => t.id === id)
  if (todo) {
    todo.isToday = !todo.isToday
    notifyTodosChanged()
  }
  return c.redirect(buildPathWithQuery('/', c.req.url, { filter, selected, sort }))
})

app.post(
  '/todos/:id/recurrence',
  zValidator('query', querySchema),
  zValidator('form', recurrenceFormSchema),
  (c) => {
    const id = c.req.param('id')
    const { filter, selected, sort } = c.req.valid('query')
    const todo = todos.find((t) => t.id === id)
    if (todo) {
      const body = c.req.valid('form')
      const recurrence = buildRecurrenceSetting({
        recurrenceType: body.recurrenceType,
        weeklyWeekdays: body.weeklyWeekdays,
        monthlyDay: body.monthlyDay
      })
      const oldRecurrence = JSON.stringify(todo.recurrence ?? null)
      const newRecurrence = JSON.stringify(recurrence ?? null)
      todo.recurrence = recurrence
      if (!recurrence) {
        todo.hasGeneratedNextOccurrence = undefined
      } else if (oldRecurrence !== newRecurrence) {
        todo.hasGeneratedNextOccurrence = false
      }
      notifyTodosChanged()
    }
    return c.redirect(buildPathWithQuery('/', c.req.url, { filter, selected, sort }))
  }
)

app.post(
  '/todos/:id/due',
  zValidator('query', querySchema),
  zValidator('form', dueDateFormSchema),
  (c) => {
    const id = c.req.param('id')
    const { filter, selected, sort } = c.req.valid('query')
    const todo = todos.find((t) => t.id === id)
    if (todo) {
      const body = c.req.valid('form')
      todo.dueDate = body.dueDate
      notifyTodosChanged()
    }
    return c.redirect(buildPathWithQuery('/', c.req.url, { filter, selected, sort }))
  }
)

app.post('/todos/:id/delete', zValidator('query', querySchema), (c) => {
  const id = c.req.param('id')
  const { filter, sort } = c.req.valid('query')
  let { selected } = c.req.valid('query')
  const index = todos.findIndex((t) => t.id === id)
  if (index !== -1) {
    todos.splice(index, 1)
    notifyTodosChanged()
    if (selected === id) {
      selected = ''
    }
  }
  return c.redirect(buildPathWithQuery('/', c.req.url, { filter, selected, sort }))
})
