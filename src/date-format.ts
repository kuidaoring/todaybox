import { Temporal } from '@js-temporal/polyfill'

export const formatDueDateLabel = (
  value: Temporal.PlainDate,
  today: Temporal.PlainDate = Temporal.Now.plainDateISO()
) => {
  if (Temporal.PlainDate.compare(value, today.subtract({ days: 1 })) === 0) {
    return '昨日'
  }
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

export const formatCompletedAtLabel = (
  value: Temporal.Instant,
  options: { today?: Temporal.PlainDate; timeZone?: string } = {}
) => {
  const timeZone = options.timeZone ?? Temporal.Now.timeZoneId()
  const zonedDateTime = value.toZonedDateTimeISO(timeZone)
  const today = options.today ?? Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate()
  const dateLabel = formatDueDateLabel(zonedDateTime.toPlainDate(), today)
  const hour = String(zonedDateTime.hour).padStart(2, '0')
  const minute = String(zonedDateTime.minute).padStart(2, '0')
  return `${dateLabel} ${hour}:${minute}`
}
