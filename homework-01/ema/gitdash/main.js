const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const simpleGit = require('simple-git');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0D0F14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── IPC: pick folder ──────────────────────────────────────────────────────────
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

// ── IPC: scan folder for git repos ───────────────────────────────────────────
ipcMain.handle('scan-repos', async (_, folderPath) => {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const repos = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const repoPath = path.join(folderPath, e.name);
    const gitDir = path.join(repoPath, '.git');
    if (fs.existsSync(gitDir)) repos.push({ name: e.name, path: repoPath });
  }
  return repos;
});

// ── IPC: get repo status ──────────────────────────────────────────────────────
ipcMain.handle('repo-status', async (_, repoPath) => {
  try {
    const git = simpleGit(repoPath);
    const [status, branches, log] = await Promise.all([
      git.status(),
      git.branch(['-a']),
      git.log(['--max-count=10', '--format=%H|%s|%an|%ar']),
    ]);

    return {
      ok: true,
      current: status.current,
      branches: branches.all,
      modified: status.modified,
      staged: status.staged,
      untracked: status.not_added,
      deleted: status.deleted,
      renamed: status.renamed.map(r => r.to),
      commits: (log.all || []).map(c => {
        const [hash, subject, author, date] = c.hash.split('|');
        return { hash: (hash || '').slice(0, 7), subject: subject || c.message || '', author, date };
      }),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── IPC: get diff for a file ──────────────────────────────────────────────────
ipcMain.handle('file-diff', async (_, repoPath, filePath) => {
  try {
    const git = simpleGit(repoPath);
    const diff = await git.diff([filePath]).catch(() => '');
    const diffStaged = await git.diff(['--cached', filePath]).catch(() => '');
    return diff || diffStaged || '(no diff available)';
  } catch (err) {
    return `Error: ${err.message}`;
  }
});
