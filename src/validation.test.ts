import { describe, expect, it } from 'vitest'
import {
  createTodoFormSchema,
  dueDateFormSchema,
  querySchema,
  recurrenceFormSchema
} from './validation.js'

describe('querySchema', () => {
  it('normalizes invalid values to defaults', () => {
    const result = querySchema.parse({ filter: 'weird', selected: 123, sort: 'xxx' })
    expect(result).toEqual({
      filter: '',
      selected: '',
      sort: 'created'
    })
  })

  it('keeps valid values', () => {
    const result = querySchema.parse({ filter: 'today', selected: 'abc', sort: 'due' })
    expect(result).toEqual({
      filter: 'today',
      selected: 'abc',
      sort: 'due'
    })
  })
})

describe('createTodoFormSchema', () => {
  it('trims strings and caps memo length', () => {
    const result = createTodoFormSchema.parse({
      title: '  task  ',
      dueDate: ' 2026-01-02 ',
      memo: ` ${'a'.repeat(2100)} `,
      isToday: 'on',
      recurrenceType: 'weekly',
      weeklyWeekdays: ['1', '4', '1', 'x'],
      monthlyDay: '15',
      filter: 'today',
      selected: ' id ',
      sort: 'due'
    })

    expect(result.title).toBe('task')
    expect(result.dueDate?.toString()).toBe('2026-01-02')
    expect(result.memo.length).toBe(2000)
    expect(result.isToday).toBe(true)
    expect(result.recurrenceType).toBe('weekly')
    expect(result.weeklyWeekdays).toEqual([1, 4])
    expect(result.monthlyDay).toBe(15)
    expect(result.filter).toBe('today')
    expect(result.selected).toBe('id')
    expect(result.sort).toBe('due')
  })

  it('normalizes invalid fields to safe defaults', () => {
    const result = createTodoFormSchema.parse({
      title: 10,
      dueDate: 'invalid',
      memo: 123,
      isToday: 'no',
      recurrenceType: 'x',
      weeklyWeekdays: ['x', '9'],
      monthlyDay: '99',
      filter: 'none',
      selected: null,
      sort: 'x'
    })

    expect(result).toEqual({
      title: '',
      dueDate: undefined,
      memo: '',
      isToday: false,
      recurrenceType: 'none',
      weeklyWeekdays: [],
      monthlyDay: undefined,
      filter: '',
      selected: '',
      sort: 'created'
    })
  })
})

describe('dueDateFormSchema', () => {
  it('accepts YYYY-MM-DD and blanks invalid values', () => {
    expect(dueDateFormSchema.parse({ dueDate: '2026-01-02' }).dueDate?.toString()).toBe('2026-01-02')
    expect(dueDateFormSchema.parse({ dueDate: 'x' })).toEqual({ dueDate: undefined })
  })
})

describe('recurrenceFormSchema', () => {
  it('parses recurrence payload safely', () => {
    const result = recurrenceFormSchema.parse({
      recurrenceType: 'monthly',
      weeklyWeekdays: ['1', 'x'],
      monthlyDay: '31'
    })

    expect(result).toEqual({
      recurrenceType: 'monthly',
      weeklyWeekdays: [1],
      monthlyDay: 31
    })
  })
})
