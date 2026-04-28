import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, globalShortcut } from 'electron';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('in-process-gpu');
app.setPath('userData', path.join(app.getPath('appData'), 'AppleMusicFloatingLyrics'));

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const devServerUrl = process.env.ELECTRON_RENDERER_URL || '';
const mediaScriptPath = path.join(appRoot, 'scripts', 'get-media-state.ps1');
const trayIcon = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
).resize({ width: 16, height: 16 });

let mainWindow = null;
let tray = null;
let clickThroughEnabled = false;

function rebuildTrayMenu() {
  if (!tray) {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (!mainWindow) {
          return;
        }

        setClickThrough(false);
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: '显示设置',
      click: () => {
        showSettingsPanel();
      },
    },
    {
      label: '解锁穿透',
      enabled: clickThroughEnabled,
      click: () => setClickThrough(false),
    },
    {
      label: '退出',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 180,
    minWidth: 680,
    minHeight: 140,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(appRoot, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    emitClickThroughState();
  });
}

function emitClickThroughState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('click-through-changed', clickThroughEnabled);
  }
}

function setClickThrough(enabled) {
  clickThroughEnabled = enabled;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(enabled, { forward: true });
  }

  rebuildTrayMenu();
  emitClickThroughState();
}

function showSettingsPanel() {
  setClickThrough(false);

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('settings-panel-toggle');
}

function createTray() {
  tray = new Tray(trayIcon);
  tray.setToolTip('Floating Lyrics');

  tray.on('click', () => {
    showSettingsPanel();
  });

  rebuildTrayMenu();
}

function runPowerShellScript() {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', mediaScriptPath],
      {
        windowsHide: true,
        cwd: appRoot,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message));
          return;
        }

        resolve(stdout.trim());
      },
    );
  });
}

ipcMain.handle('media:get-state', async () => {
  const raw = await runPowerShellScript();
  const parsed = JSON.parse(raw || '{}');

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  return parsed;
});

ipcMain.handle('window:set-click-through', async (_event, enabled) => {
  setClickThrough(Boolean(enabled));
});

ipcMain.handle('window:set-size', async (_event, width, height) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const nextWidth = Math.max(520, Math.min(1400, Math.round(Number(width) || 980)));
  const nextHeight = Math.max(120, Math.min(520, Math.round(Number(height) || 180)));
  mainWindow.setSize(nextWidth, nextHeight);
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  setClickThrough(false);
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    showSettingsPanel();
  });
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    showSettingsPanel();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
