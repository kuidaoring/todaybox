import {
  app as electronApp,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage
} from 'electron'
import { serve } from '@hono/node-server'
import { app, subscribeTodosChanged, type TodayTasksPayload } from './server.js'
import { buildTrayMenuModel } from './tray-menu.js'
import { createMenuTemplate } from './menu-template.js'

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

const rebuildTrayMenu = async () => {
  if (!tray) {
    return
  }

  try {
    const payload = await fetchTodayTasksPayload()
    const model = buildTrayMenuModel(payload)
    tray.setTitle(`todaybox ${payload.count}`)
    tray.setContextMenu(
      Menu.buildFromTemplate(
        createMenuTemplate(model, {
          onOpen: focusWindowWithSelectedTodo,
          onRefresh: () => {
            void rebuildTrayMenu()
          },
          onQuit: () => electronApp.quit()
        })
      )
    )
  } catch (error) {
    console.error(error)
    const model = buildTrayMenuModel(undefined, { error: true })
    tray.setTitle('todaybox')
    tray.setContextMenu(
      Menu.buildFromTemplate(
        createMenuTemplate(model, {
          onOpen: focusWindowWithSelectedTodo,
          onRefresh: () => {
            void rebuildTrayMenu()
          },
          onQuit: () => electronApp.quit()
        })
      )
    )
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
