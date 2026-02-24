import { describe, expect, it, vi } from 'vitest'
import { createMenuTemplate } from './menu-template.js'
import type { TrayMenuModelEntry } from './tray-menu.js'

describe('createMenuTemplate', () => {
  it('maps task to normal menu item with sublabel', () => {
    const onOpen = vi.fn()
    const onRefresh = vi.fn()
    const onQuit = vi.fn()
    const model: TrayMenuModelEntry[] = [
      { kind: 'task', todoId: 't1', label: 'task', completed: true, sublabel: '📅 今日' }
    ]

    const template = createMenuTemplate(model, { onOpen, onRefresh, onQuit })
    expect(template).toHaveLength(1)
    expect(template[0]).toMatchObject({
      label: 'task',
      sublabel: '📅 今日'
    })

    template[0].click?.(undefined as any, undefined as any, undefined as any)
    expect(onOpen).toHaveBeenCalledWith('t1')
  })

  it('maps control entries and separator', () => {
    const onOpen = vi.fn()
    const onRefresh = vi.fn()
    const onQuit = vi.fn()
    const model: TrayMenuModelEntry[] = [
      { kind: 'separator' },
      { kind: 'open', label: '開く' },
      { kind: 'refresh', label: '再読み込み' },
      { kind: 'quit', label: '終了' },
      { kind: 'error', label: '取得失敗' }
    ]

    const template = createMenuTemplate(model, { onOpen, onRefresh, onQuit })

    expect(template[0]).toMatchObject({ type: 'separator' })
    expect(template[1]).toMatchObject({ label: '開く' })
    expect(template[2]).toMatchObject({ label: '再読み込み' })
    expect(template[3]).toMatchObject({ label: '終了' })
    expect(template[4]).toMatchObject({ label: '取得失敗', enabled: false })

    template[1].click?.(undefined as any, undefined as any, undefined as any)
    template[2].click?.(undefined as any, undefined as any, undefined as any)
    template[3].click?.(undefined as any, undefined as any, undefined as any)
    expect(onOpen).toHaveBeenCalledWith()
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(onQuit).toHaveBeenCalledOnce()
  })
})
