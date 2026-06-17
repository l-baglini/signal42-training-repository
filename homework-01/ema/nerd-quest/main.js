'use strict';

const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width:           1360,   // wider than canvas so frame never clips it
    height:          860,    // taller than canvas to absorb the title bar
    minWidth:        800,
    minHeight:       540,
    resizable:       true,
    autoHideMenuBar: true,
    backgroundColor: '#0a0c1e',
    title:           'Nerd Quest — Game of the Goose',
    webPreferences:  {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
