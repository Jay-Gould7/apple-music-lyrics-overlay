import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('floatingLyrics', {
  getMediaState: () => ipcRenderer.invoke('media:get-state'),
  setClickThrough: (enabled) => ipcRenderer.invoke('window:set-click-through', enabled),
  setWindowSize: (width, height) => ipcRenderer.invoke('window:set-size', width, height),
  onClickThroughChanged: (listener) => {
    const wrapped = (_event, enabled) => listener(Boolean(enabled));
    ipcRenderer.on('click-through-changed', wrapped);
    return () => {
      ipcRenderer.removeListener('click-through-changed', wrapped);
    };
  },
  onSettingsPanelToggle: (listener) => {
    const wrapped = () => listener();
    ipcRenderer.on('settings-panel-toggle', wrapped);
    return () => {
      ipcRenderer.removeListener('settings-panel-toggle', wrapped);
    };
  },
});
