import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { jsxRenderer } from 'hono/jsx-renderer'
import { zValidator } from '@hono/zod-validator'
import { Temporal } from '@js-temporal/polyfill'
import { createTodoFormSchema, dueDateFormSchema, querySchema } from './validation.js'
import { formatDueDateLabel } from './date-format.js'

export const app = new Hono()

export type Todo = {
  id: string
  title: string
  completed: boolean
  createdAt: Temporal.Instant
  dueDate?: Temporal.PlainDate
  isToday?: boolean
  memo?: string
}

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

const todos: Todo[] = []
const now = Temporal.Now.instant()
const toUtcPlainDate = (value: Temporal.Instant) => value.toZonedDateTimeISO('UTC').toPlainDate()
const formatPlainDateInput = (value: Temporal.PlainDate | undefined) => value?.toString() ?? ''
const formatInstantLabel = (value: Temporal.Instant) =>
  new Date(Number(value.epochMilliseconds)).toLocaleString()
const todosChangedListeners = new Set<() => void>()
export { formatDueDateLabel } from './date-format.js'

const notifyTodosChanged = () => {
  for (const listener of todosChangedListeners) {
    listener()
  }
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
      dueDateIso: todo.dueDate?.toString()
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
  const sharedQuery = { filter, selected, sort }
  const sorted = sortTodos(todos, sort)
  const filtered = filterTodosByToday(sorted, filter)
  const { incomplete: incompleteTodos, completed: completedTodos } =
    splitTodosByCompletion(filtered)
  const shouldOpenCompletedSection = completedTodos.some((todo) => todo.id === selected)
  const renderInlineDetails = (todo: Todo) => (
    <div className="ml-7 space-y-1 rounded border border-zinc-300 p-3 text-sm">
      <div className="flex justify-end">
        <a href={buildPathWithQuery('/', c.req.url, { filter, selected: '', sort })} className="text-sm">
          閉じる
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>締切:</span>
        <form
          method="post"
          action={buildPathWithQuery(`/todos/${todo.id}/due`, c.req.url, sharedQuery)}
          className="inline-flex items-center gap-2"
        >
          <input type="date" name="dueDate" value={formatPlainDateInput(todo.dueDate)} />
          <button type="submit">{todo.dueDate ? '締切を更新' : '締切を設定'}</button>
        </form>
        {todo.dueDate ? (
          <form
            method="post"
            action={buildPathWithQuery(`/todos/${todo.id}/due`, c.req.url, sharedQuery)}
            className="inline"
          >
            <input type="hidden" name="dueDate" value="" />
            <button type="submit">クリア</button>
          </form>
        ) : null}
      </div>
      <form
        method="post"
        action={buildPathWithQuery(`/todos/${todo.id}/delete`, c.req.url, sharedQuery)}
        className="inline"
      >
        <button type="submit">削除</button>
      </form>
      <div>
        <p>メモ:</p>
        <pre className="whitespace-pre-wrap">{todo.memo || 'なし'}</pre>
      </div>
      <p>作成: {formatInstantLabel(todo.createdAt)}</p>
    </div>
  )
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
        <form method="get" action="/" className="flex items-center gap-2">
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
        {filter ? <input type="hidden" name="filter" value={filter} /> : null}
        {selected ? <input type="hidden" name="selected" value={selected} /> : null}
        <input type="hidden" name="sort" value={sort} />
        <button type="submit">追加</button>
      </form>
      <div className="grid gap-6">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">一覧</h2>
          {filtered.length ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-base font-semibold">
                  {formatCountLabel('未完了', incompleteTodos.length)}
                </h3>
                {incompleteTodos.length ? (
                  <ul className="space-y-2">
                    {incompleteTodos.map((todo) => (
                      <li className="space-y-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <form
                            method="post"
                            action={buildPathWithQuery(
                              `/todos/${todo.id}/toggle`,
                              c.req.url,
                              sharedQuery
                            )}
                            className="inline"
                          >
                            <button
                              type="submit"
                              aria-label="完了にする"
                              aria-pressed="false"
                              className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-400 bg-white text-transparent text-[11px] leading-none transition-colors hover:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                            >
                              ✓
                            </button>
                          </form>
                          <a
                            href={buildPathWithQuery('/', c.req.url, {
                              filter,
                              selected: todo.id,
                              sort
                            })}
                          >
                            <span className={todo.id === selected ? 'font-bold' : ''}>
                              {todo.title}
                            </span>
                          </a>
                          {todo.dueDate ? (
                            <small className="text-xs">📅 {formatDueDateLabel(todo.dueDate)}</small>
                          ) : null}
                          {todo.memo ? (
                            <small className="text-xs">📝 メモ</small>
                          ) : null}
                          <form
                            method="post"
                            action={buildPathWithQuery(
                              `/todos/${todo.id}/today`,
                              c.req.url,
                              sharedQuery
                            )}
                            className="inline"
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
                            >
                              📍
                            </button>
                          </form>
                        </div>
                        {todo.id === selected ? renderInlineDetails(todo) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm">未完了のタスクはありません。</p>
                )}
              </div>
              <details className="space-y-2" open={shouldOpenCompletedSection ? true : undefined}>
                <summary className="cursor-pointer text-base font-semibold">
                  {formatCountLabel('完了', completedTodos.length)}
                </summary>
                {completedTodos.length ? (
                  <ul className="space-y-2">
                    {completedTodos.map((todo) => (
                      <li className="space-y-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <form
                            method="post"
                            action={buildPathWithQuery(
                              `/todos/${todo.id}/toggle`,
                              c.req.url,
                              sharedQuery
                            )}
                            className="inline"
                          >
                            <button
                              type="submit"
                              aria-label="未完了に戻す"
                              aria-pressed="true"
                              className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-600 bg-emerald-600 text-white text-[11px] leading-none transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                            >
                              ✓
                            </button>
                          </form>
                          <a
                            href={buildPathWithQuery('/', c.req.url, {
                              filter,
                              selected: todo.id,
                              sort
                            })}
                          >
                            <span
                              className={[
                                'line-through',
                                todo.id === selected ? 'font-bold' : ''
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {todo.title}
                            </span>
                          </a>
                          {todo.dueDate ? (
                            <small className="text-xs">📅 {formatDueDateLabel(todo.dueDate)}</small>
                          ) : null}
                          {todo.memo ? (
                            <small className="text-xs">📝 メモ</small>
                          ) : null}
                          <form
                            method="post"
                            action={buildPathWithQuery(
                              `/todos/${todo.id}/today`,
                              c.req.url,
                              sharedQuery
                            )}
                            className="inline"
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
                            >
                              📍
                            </button>
                          </form>
                        </div>
                        {todo.id === selected ? renderInlineDetails(todo) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm">完了したタスクはありません。</p>
                )}
              </details>
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
  const { title, dueDate, memo, filter, selected, sort } = body
  const isToday = body.isToday || filter === 'today'
  if (title) {
    const createdAt = Temporal.Now.instant()
    todos.push({
      id: `${Number(createdAt.epochMilliseconds)}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      completed: false,
      createdAt,
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
