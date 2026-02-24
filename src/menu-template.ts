import type { MenuItemConstructorOptions } from 'electron'
import type { TrayMenuModelEntry } from './tray-menu.js'

type MenuTemplateHandlers = {
  onOpen: (todoId?: string) => void
  onRefresh: () => void
  onQuit: () => void
}

export const createMenuTemplate = (
  model: TrayMenuModelEntry[],
  handlers: MenuTemplateHandlers
): MenuItemConstructorOptions[] => {
  const template: MenuItemConstructorOptions[] = []
  for (const entry of model) {
    if (entry.kind === 'separator') {
      template.push({ type: 'separator' })
      continue
    }
    if (entry.kind === 'task') {
      template.push({
        label: entry.label,
        sublabel: entry.sublabel,
        click: () => handlers.onOpen(entry.todoId)
      })
      continue
    }
    if (entry.kind === 'open') {
      template.push({
        label: entry.label,
        click: () => handlers.onOpen()
      })
      continue
    }
    if (entry.kind === 'refresh') {
      template.push({
        label: entry.label,
        click: () => handlers.onRefresh()
      })
      continue
    }
    if (entry.kind === 'quit') {
      template.push({
        label: entry.label,
        click: () => handlers.onQuit()
      })
      continue
    }
    template.push({
      label: entry.label,
      enabled: false
    })
  }
  return template
}
