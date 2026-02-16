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
  filter: filterSchema,
  selected: selectedSchema,
  sort: sortSchema
})

export const dueDateFormSchema = z.object({
  dueDate: dueDateSchema
})
