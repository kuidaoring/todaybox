import {
  app as electronApp,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  type MenuItemConstructorOptions
} from 'electron'
import { serve } from '@hono/node-server'
import { app, subscribeTodosChanged, type TodayTasksPayload } from './server.js'
import { buildTrayMenuModel } from './tray-menu.js'

const port = 8787
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

const ensureWindow = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }
    mainWindow.focus()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 960,
    height: 720
  })

  mainWindow.loadURL(`http://localhost:${port}`)
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  return mainWindow
}

const focusWindowWithSelectedTodo = (todoId?: string) => {
  const win = ensureWindow()
  const query = todoId ? `?selected=${encodeURIComponent(todoId)}` : ''
  win.loadURL(`http://localhost:${port}/${query}`)
}

const fetchTodayTasksPayload = async (): Promise<TodayTasksPayload> => {
  const response = await fetch(`http://localhost:${port}/api/today`)
  if (!response.ok) {
    throw new Error(`Failed to fetch today tasks: ${response.status}`)
  }
  return (await response.json()) as TodayTasksPayload
}

const toMenuTemplate = (model: ReturnType<typeof buildTrayMenuModel>) => {
  const template: MenuItemConstructorOptions[] = []
  for (const entry of model) {
    if (entry.kind === 'separator') {
      template.push({ type: 'separator' })
      continue
    }
    if (entry.kind === 'task') {
      const primary: MenuItemConstructorOptions = {
        type: 'checkbox',
        checked: entry.completed,
        label: entry.label,
        sublabel: entry.sublabel,
        click: () => focusWindowWithSelectedTodo(entry.todoId)
      }
      template.push(primary)
      continue
    }
    if (entry.kind === 'open') {
      template.push({
        label: entry.label,
        click: () => focusWindowWithSelectedTodo()
      })
      continue
    }
    if (entry.kind === 'refresh') {
      template.push({
        label: entry.label,
        click: () => {
          void rebuildTrayMenu()
        }
      })
      continue
    }
    if (entry.kind === 'quit') {
      template.push({
        label: entry.label,
        click: () => electronApp.quit()
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

const rebuildTrayMenu = async () => {
  if (!tray) {
    return
  }

  try {
    const payload = await fetchTodayTasksPayload()
    const model = buildTrayMenuModel(payload)
    tray.setTitle(`todaybox ${payload.count}`)
    tray.setContextMenu(Menu.buildFromTemplate(toMenuTemplate(model)))
  } catch (error) {
    console.error(error)
    const model = buildTrayMenuModel(undefined, { error: true })
    tray.setTitle('todaybox')
    tray.setContextMenu(Menu.buildFromTemplate(toMenuTemplate(model)))
  }
}

const createTray = () => {
  if (process.platform !== 'darwin' || tray) {
    return
  }
  tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('todaybox')
  void rebuildTrayMenu()
}

electronApp.whenReady().then(() => {
  serve({ fetch: app.fetch, port })
  ensureWindow()
  createTray()

  subscribeTodosChanged(() => {
    void rebuildTrayMenu()
  })

  electronApp.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ensureWindow()
    }
    void rebuildTrayMenu()
  })
})

electronApp.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    electronApp.quit()
  }
})
