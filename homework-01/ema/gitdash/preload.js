const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitdash', {
  pickFolder:  ()              => ipcRenderer.invoke('pick-folder'),
  scanRepos:   (folder)       => ipcRenderer.invoke('scan-repos', folder),
  repoStatus:  (repoPath)     => ipcRenderer.invoke('repo-status', repoPath),
  fileDiff:    (repo, file)   => ipcRenderer.invoke('file-diff', repo, file),
});
