import { Temporal } from '@js-temporal/polyfill'

export const formatDueDateLabel = (
  value: Temporal.PlainDate,
  today: Temporal.PlainDate = Temporal.Now.plainDateISO()
) => {
  if (Temporal.PlainDate.compare(value, today) === 0) {
    return '今日'
  }
  if (Temporal.PlainDate.compare(value, today.add({ days: 1 })) === 0) {
    return '明日'
  }
  if (value.year === today.year) {
    return `${value.month}/${value.day}`
  }
  return `${value.year}/${value.month}/${value.day}`
}

export const formatDueDateIsoForMenu = (
  value: string | undefined,
  today: Temporal.PlainDate = Temporal.Now.plainDateISO()
) => {
  if (!value) {
    return undefined
  }
  try {
    const dueDate = Temporal.PlainDate.from(value)
    return `📅 ${formatDueDateLabel(dueDate, today)}`
  } catch {
    return undefined
  }
}
