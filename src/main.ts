import { app as electronApp, BrowserWindow } from 'electron'
import { serve } from '@hono/node-server'
import { app } from './server.js'

const port = 8787

const createWindow = () => {
  const win = new BrowserWindow({
    width: 960,
    height: 720
  })

  win.loadURL(`http://localhost:${port}`)
}

electronApp.whenReady().then(() => {
  serve({ fetch: app.fetch, port })
  createWindow()

  electronApp.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

electronApp.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    electronApp.quit()
  }
})
