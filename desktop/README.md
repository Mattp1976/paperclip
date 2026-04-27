# Paperclip desktop

Electron shell that wraps the existing `@orqestra/server` + `@orqestra/ui` so
Paperclip can be distributed as a native desktop app (.dmg / .exe / AppImage) with
no manual Postgres setup. The server's built-in `embedded-postgres` fallback handles
the database — users get a working install from a single binary.

This is **v0.2 scope** — distribution-ready. In scope now: electron-builder
config that handles pnpm + native modules, macOS/Windows code-signing +
notarization hooks, `electron-updater` wired against GitHub Releases, and a
`desktop-release.yml` workflow that builds on all three platforms on tag push.

Still intentionally out of scope:

- PGlite swap — `embedded-postgres` is already in the monorepo and gives users
  the same "no DB setup" experience today. PGlite becomes a v0.3 optimization
  once we want smaller installers and browser-compatible migrations.
- Native menus, tray icons, deep links, IPC-exposed filesystem helpers — all
  fine to add incrementally; the `preload.ts` seam is already in place.
- App icons. `build/icon.icns` (macOS), `build/icon.ico` (Windows), and
  `build/icon.png` (Linux, 512×512 minimum) need to be dropped in before the
  first public release; electron-builder falls back to the default Electron
  icon if they're missing.

## Two run modes

The main process picks mode from a single env var:

| mode          | trigger                  | server                                              | UI                       |
| ------------- | ------------------------ | --------------------------------------------------- | ------------------------ |
| Dev (wrap)    | `PAPERCLIP_URL` set      | You run `pnpm dev:server` separately.               | Vite dev or static dist. |
| Packaged      | `PAPERCLIP_URL` unset    | Electron boots `startServer()` in-process.          | `ui/dist` served by API. |

## Local dev loop

In one terminal:

```bash
pnpm dev:server    # boots server on :3100 with embedded-postgres
pnpm dev:ui        # boots Vite dev on :5173, proxies /api → :3100
```

In a second terminal:

```bash
pnpm dev:desktop   # Electron opens a window at http://localhost:3100
```

Point at the Vite dev server instead if you want HMR on UI changes:

```bash
PAPERCLIP_URL=http://localhost:5173 pnpm dev:desktop
```

## Packaging

The `prepackage` script builds shared → db → server → ui, copies `ui/dist` into
`server/ui-dist`, and compiles the desktop main process — so one command is
enough:

```bash
pnpm --filter @orqestra/desktop package
```

Output lands in `desktop/release/`. On first boot the app creates its
embedded-postgres data directory under the user's config path and auto-applies
migrations (`PAPERCLIP_MIGRATION_AUTO_APPLY=true` is set by the shell).

### How the server gets in the bundle

The Electron main process locates the compiled server entrypoint at runtime —
first under `process.resourcesPath/server/dist/index.js` (where electron-builder
drops it via `extraResources`), then the sibling `../server/dist/index.js` in
the monorepo for unpackaged runs. It does NOT import `@orqestra/server` as
a module — the workspace `exports` map points at raw TypeScript, which Node
can't execute. If you switch the server package to a dual-export layout later,
you can simplify this back to a normal `import`.

### Native modules (embedded-postgres, sharp)

`asarUnpack` in `build` pulls the sharp and embedded-postgres binaries out of
the asar archive so they can be dlopen'd at runtime. We also set
`npmRebuild: false` / `nodeGypRebuild: false` because pnpm's `.pnpm/` layout
doesn't play nicely with electron-builder's default rebuild step — the binaries
shipped by the upstream packages work on Electron's Node ABI directly.

## Code signing + notarization

electron-builder reads cert material from standard env vars — just set them in
the environment before `pnpm package:desktop` (or in CI secrets):

| env var                         | purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `CSC_LINK`                      | macOS Developer ID `.p12` (base64 data URL or https URL) |
| `CSC_KEY_PASSWORD`              | password for the `.p12`                                  |
| `APPLE_ID`                      | Apple Developer account email (notarization)            |
| `APPLE_APP_SPECIFIC_PASSWORD`   | app-specific password from appleid.apple.com            |
| `APPLE_TEAM_ID`                 | 10-char Team ID                                          |
| `WIN_CSC_LINK`                  | Windows Authenticode `.pfx` (base64 data URL or https URL) |
| `WIN_CSC_KEY_PASSWORD`          | password for the `.pfx`                                  |

Notarization happens in `build/notarize.cjs` (an electron-builder `afterSign`
hook). If any Apple env var is unset the hook no-ops with a warning, so local
unsigned dev builds still work. Hardened-runtime entitlements live in
`build/entitlements.mac.plist` — update them before enabling any new
capabilities like camera/mic.

## Auto-update

`electron-updater` is wired into `main.ts` and points at the GitHub Releases
`publish` config in `package.json`. In packaged builds the app:

1. Checks for updates 5 s after boot.
2. Re-checks every 6 hours while running.
3. Downloads in the background.
4. Prompts the user on completion with a "Restart now / Later" dialog.
5. Installs on quit if the user chose Later.

Set `PAPERCLIP_DISABLE_UPDATES=1` to skip all of the above — useful for
airgapped / enterprise installs.

## Releasing

Push a tag that matches `desktop-v*`:

```bash
git tag desktop-v0.2.0
git push origin desktop-v0.2.0
```

The `desktop-release.yml` GitHub Actions workflow builds on macOS, Windows, and
Ubuntu in parallel, signs + notarizes on macOS and Windows if the secrets are
set, and uploads the artifacts plus the `latest*.yml` update metadata to the
resulting GitHub Release. Manually run the workflow with `dry_run: true` to
validate the config without publishing.
