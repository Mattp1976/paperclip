/**
 * Paperclip desktop — Electron main process.
 *
 * v0.1 scope: one window, embed the existing server, no auto-update, no code signing.
 *
 * Two modes:
 *   - DEV:  PAPERCLIP_URL is set  → skip server, just open a BrowserWindow at that URL.
 *           Use this when you're running `pnpm --filter @orqestra/server dev`
 *           alongside `pnpm --filter @orqestra/ui dev`.
 *   - PROD: PAPERCLIP_URL unset   → import `startServer()` from @orqestra/server,
 *           boot it in-process with embedded Postgres, then open the window at the
 *           returned apiUrl.
 *
 * Embedded Postgres is handled by the server itself (see server/src/index.ts). We
 * don't need to manage it here — the server lazily inits a data dir under the
 * user's config path and auto-applies migrations on first run. On quit we don't
 * currently stop it cleanly; it has stale-pidfile recovery so this is fine for v0.1.
 */
import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import electronUpdater from "electron-updater";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

// electron-updater is CJS; destructure the default export for ESM interop.
const { autoUpdater } = electronUpdater;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 800;

/** Milliseconds between background update checks once the app is running. */
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

function buildMenu(): void {
  // Keep the default menu on macOS (it provides copy/paste/Quit). On other
  // platforms we hide it — the app window owns the chrome.
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }
}

function createWindow(targetUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#f8f7f4", // taupe-ish to match the pastel theme and avoid white flash
    title: "Paperclip",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // External links open in the user's default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    const current = new URL(targetUrl);
    if (target.origin !== current.origin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  void win.loadURL(targetUrl);
  return win;
}

/**
 * Resolve the compiled server entrypoint. We can't use a normal
 * `import("@orqestra/server")` because the server's `exports` map points at
 * raw TypeScript (./src/index.ts) for in-monorepo dev consumers, which Node
 * can't execute. Instead we locate the compiled dist file at runtime:
 *
 *   - Packaged Electron: electron-builder places server/dist into
 *     `process.resourcesPath/server/dist/index.js` (see desktop/package.json
 *     `build.extraResources`).
 *   - Dev / unpackaged: fall back to the sibling workspace path. Requires
 *     `pnpm --filter @orqestra/server build` to have been run first.
 *
 * If neither file exists we throw a clear error pointing the user at the dev
 * loop (PAPERCLIP_URL) while they figure out their build.
 */
function resolveServerEntry(): string {
  const packagedPath = path.join(process.resourcesPath ?? "", "server", "dist", "index.js");
  if (process.resourcesPath && existsSync(packagedPath)) {
    return packagedPath;
  }
  // Unpackaged: desktop/dist/main.js → ../../server/dist/index.js
  const monorepoPath = path.resolve(__dirname, "..", "..", "server", "dist", "index.js");
  if (existsSync(monorepoPath)) {
    return monorepoPath;
  }
  throw new Error(
    "Could not locate the compiled server. Run `pnpm --filter @orqestra/server build` " +
      "and try again, or set PAPERCLIP_URL=http://localhost:3100 to wrap an already-running " +
      "dev server (see desktop/README.md).",
  );
}

async function bootEmbeddedServer(): Promise<string> {
  // Force desktop-appropriate defaults before the config module reads env.
  process.env.PAPERCLIP_DEPLOYMENT_MODE ??= "local_trusted";
  process.env.PAPERCLIP_MIGRATION_AUTO_APPLY ??= "true";
  process.env.PAPERCLIP_MIGRATION_PROMPT ??= "never";
  process.env.PAPERCLIP_OPEN_ON_LISTEN = "false"; // Electron opens the window, not the OS browser
  process.env.SERVE_UI ??= "true";

  const serverEntry = resolveServerEntry();
  const mod = (await import(pathToFileURL(serverEntry).href)) as {
    startServer: () => Promise<{ apiUrl: string }>;
  };
  const started = await mod.startServer();
  return started.apiUrl;
}

/**
 * Wire electron-updater against the GitHub Releases publish bucket configured
 * in desktop/package.json. Only active in packaged builds — running against
 * the dev shell would try (and fail) to check for updates on every boot.
 *
 * Escape hatch: `PAPERCLIP_DISABLE_UPDATES=1` skips the wiring entirely. Useful
 * for airgapped/enterprise installs that don't want the process to phone home.
 *
 * Strategy: auto-download updates in the background, then prompt the user to
 * restart when they're ready. On dismissal we install silently on next quit.
 */
function wireAutoUpdate(win: BrowserWindow): void {
  if (!app.isPackaged) return;
  if (process.env.PAPERCLIP_DISABLE_UPDATES === "1") return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[updater] error", err);
  });

  autoUpdater.on("update-available", (info) => {
    // eslint-disable-next-line no-console
    console.log(`[updater] update-available ${info.version}`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    void dialog
      .showMessageBox(win, {
        type: "info",
        title: "Paperclip update ready",
        message: `Paperclip ${info.version} is downloaded and ready to install. Restart now?`,
        detail:
          "If you choose Later, the update will install automatically the next time you quit Paperclip.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  // Initial check shortly after boot, then periodically while the app runs.
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[updater] initial check failed:", err);
    });
  }, 5_000);

  setInterval(() => {
    void autoUpdater.checkForUpdates().catch(() => {
      /* logged via 'error' handler */
    });
  }, UPDATE_CHECK_INTERVAL_MS);
}

async function main(): Promise<void> {
  const devUrl = process.env.PAPERCLIP_URL;
  const targetUrlPromise = devUrl ? Promise.resolve(devUrl) : bootEmbeddedServer();

  // Run server boot and app ready in parallel — Electron's whenReady is usually
  // the slower of the two on a cold start.
  const [targetUrl] = await Promise.all([targetUrlPromise, app.whenReady()]);

  buildMenu();
  const win = createWindow(targetUrl);
  wireAutoUpdate(win);

  app.on("activate", () => {
    // macOS: re-create the window if the user clicks the dock icon with no windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(targetUrl);
    }
  });
}

app.on("window-all-closed", () => {
  // Standard macOS behaviour: keep the app alive so the dock icon works.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Paperclip desktop failed to start:", err);
  app.exit(1);
});
