# Paperclip AI — V2 Redesign Handoff

## Project
- **Repo**: `/Users/mattparry/Desktop/Future Collective/paperclip-build` (monorepo)
- **What it is**: Open-source control plane for autonomous AI companies ("The Agent Collective" / "The Future Collective")
- **Company ID**: `2ed0dde7-7fc2-4985-b433-7662463dc6a1` (prefix: `THE`)
- **Dev server**: `pnpm dev` → runs on port 3100, URLs need company prefix (e.g. `/THE/dashboard`)
- **UI stack**: React, Tailwind CSS v4, OKLCH colors, Shadcn/UI, TanStack React Query, Lucide icons

## Governing Directive
"Do you want to just take over and do it please" — autonomous implementation. Make decisions, implement, verify in browser. No need to ask permission for design/implementation choices.

## What's Been Completed (all verified in browser)
1. **Light mode default** — switched from dark to light
2. **Sidebar transformation** — clean, modern sidebar design
3. **Shadow-based cards polish** — consistent card styling across app
4. **Micro-interactions** — hover states, transitions throughout
5. **Empty states** — friendly illustrations/messages for empty pages
6. **Table/list rows** — polished table styling
7. **Agent detail polish** — agent detail page refinements

## What's Built But Needs Server Restart to Verify
These features are coded and saved to disk but the user hasn't been able to verify them because the dev server needs restarting:

### 1. Dashboard "Latest Work" Feed
- **File**: `ui/src/components/LatestWorkFeed.tsx` (NEW)
- **File**: `ui/src/components/OutputCard.tsx` (NEW)
- **Edit**: `ui/src/pages/Dashboard.tsx` — imported LatestWorkFeed, placed between charts and Fleet Health
- Shows 3 most recent successful agent outputs as rich preview cards

### 2. Dedicated Outputs Page
- **File**: `ui/src/pages/Outputs.tsx` (NEW)
- Full page showing all agent outputs with search and agent filter dropdown
- Shows count of outputs, newest-first ordering

### 3. Routing Fix for Outputs
The Outputs page had a routing bug where clicking "Outputs" in the sidebar navigated to `/OUTPUTS/dashboard` (treating "outputs" as a company prefix) instead of `/THE/outputs`. This has been fixed:

- **`ui/src/lib/company-routes.ts`** — Added `"outputs"` to the `BOARD_ROUTE_ROOTS` set (line 20)
- **`ui/src/App.tsx`** — Added:
  - `import { Outputs } from "./pages/Outputs"` (line 43)
  - `<Route path="outputs" element={<Outputs />} />` inside boardRoutes (line 176)
  - `<Route path="outputs" element={<UnprefixedBoardRedirect />} />` for unprefixed redirect (line 355)
- **`ui/src/components/Sidebar.tsx`** — `<SidebarNavItem to="/outputs" label="Outputs" icon={Sparkles} />` (line 99)

## First Step for New Session
1. **Restart the dev server**: `pnpm dev` in the project root
2. **Clear Vite cache first** (recommended): `rm -rf ui/node_modules/.vite && pnpm dev`
3. **Open browser** to `http://localhost:3100/THE/dashboard`
4. **Verify**: Click "Outputs" in sidebar → should go to `/THE/outputs` with a list of outputs
5. **Verify**: Dashboard should show "Latest Work" feed with 3 output cards below the charts

## Key Architecture Notes

### Company-Prefix Routing
The app uses a custom routing system in `ui/src/lib/router.tsx`:
- `NavLink`, `Link`, `Navigate` from `@/lib/router` (NOT react-router-dom directly)
- These wrappers call `applyCompanyPrefix()` from `company-routes.ts`
- `BOARD_ROUTE_ROOTS` set determines which URL segments are routes vs company prefixes
- If a path segment isn't in BOARD_ROUTE_ROOTS or GLOBAL_ROUTE_ROOTS, it's treated as a company prefix
- **Any new top-level route MUST be added to BOARD_ROUTE_ROOTS** or it'll break

### File Structure
```
ui/src/
  pages/          — page-level components (Dashboard, Outputs, etc.)
  components/     — shared components (Sidebar, OutputCard, etc.)
  lib/
    router.tsx    — company-prefix-aware routing wrappers
    company-routes.ts — BOARD_ROUTE_ROOTS, prefix logic
  App.tsx         — route definitions
```

### Dev Server
- `pnpm dev` runs `scripts/dev-runner.mjs` which starts both backend + Vite frontend
- Backend uses `tsx` for TypeScript execution
- Vite serves the UI with HMR
- `pnpm` is required (not npm/yarn) — use `npx pnpm` if not globally installed
