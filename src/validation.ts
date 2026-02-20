import { z } from 'zod'
import { Temporal } from '@js-temporal/polyfill'

const datePattern = /^\d{4}-\d{2}-\d{2}$/

const filterSchema = z.enum(['', 'today']).default('').catch('')

const selectedSchema = z.string().trim().default('').catch('')

const sortSchema = z.enum(['created', 'due']).default('created').catch('created')

const dueDateSchema = z
  .string()
  .trim()
  .default('')
  .catch('')
  .transform((value) => {
    if (!datePattern.test(value)) {
      return undefined
    }
    try {
      return Temporal.PlainDate.from(value)
    } catch {
      return undefined
    }
  })

const memoSchema = z.string().trim().transform((value) => value.slice(0, 2000)).default('').catch('')

const titleSchema = z.string().trim().default('').catch('')

const isTodaySchema = z.literal('on').transform(() => true).default(false).catch(false)
const recurrenceTypeSchema = z.enum(['none', 'weekly', 'monthly']).default('none').catch('none')

const weeklyWeekdaysSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    const raw = value === undefined ? [] : Array.isArray(value) ? value : [value]
    const weekdays = raw
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)
    return [...new Set(weekdays)].sort((a, b) => a - b)
  })

const monthlyDaySchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) {
      return undefined
    }
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      return undefined
    }
    return parsed
  })

export const querySchema = z.object({
  filter: filterSchema,
  selected: selectedSchema,
  sort: sortSchema
})

export const createTodoFormSchema = z.object({
  title: titleSchema,
  dueDate: dueDateSchema,
  memo: memoSchema,
  isToday: isTodaySchema,
  recurrenceType: recurrenceTypeSchema,
  weeklyWeekdays: weeklyWeekdaysSchema,
  monthlyDay: monthlyDaySchema,
  filter: filterSchema,
  selected: selectedSchema,
  sort: sortSchema
})

export const recurrenceFormSchema = z.object({
  recurrenceType: recurrenceTypeSchema,
  weeklyWeekdays: weeklyWeekdaysSchema,
  monthlyDay: monthlyDaySchema
})

export const dueDateFormSchema = z.object({
  dueDate: dueDateSchema
})
