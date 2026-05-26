# CFR PMO — Azure Static Web Apps build

> **Goal:** Take the existing React UI from the Baker Tilly Power Apps Code App and turn it
> into a standalone Azure Static Web App that runs entirely off in-memory mock data.
> Keep the template, theme, components, routing, and UX exactly as-is. Strip the
> Power Platform plumbing so the app builds and runs with zero Baker Tilly network deps.

## What was copied here

The entire contents of `…/corp-fin-bi-pmo-cfr-solution/app/` (minus `node_modules/`
and `dist/`) were copied verbatim. No edits yet. Source repo is at:

  `C:\Users\C976089\Documents\GitHub\corp-fin-bi-pmo-cfr-solution\app\`

Read it for reference whenever you need the original.

## Branding rename — CVS → Baker Tilly (DONE)

All occurrences of `CVS` and `cvs` have been replaced with `Baker Tilly` / `baker tilly`
throughout the codebase. The source files contained no CVS branding strings (the app
was already generic), so only this CLAUDE.md and the goal description required updating.

## Hard constraints

- **DO NOT** redesign UI, change layouts, rename pages, or restructure components.
- **DO NOT** rip out fixtures/demoData. They are the source of truth for mocked data.
- **DO NOT** add a real backend. No Functions, no Azure SQL, no Cosmos. Pure static SPA.
- **DO NOT** wire Entra ID auth yet — anonymous SWA for now. (Future work.)
- **KEEP** all 70+ pages, all routing, all theming, all shadcn components.
- **KEEP** the build sequence: `tsc -b && vite build` must succeed with zero errors.

## The strip — what to remove or stub

### 1. Force demo mode on every boot (FAST WIN — most of the work is already done)

The codebase already has `lib/demoMode.ts` + `lib/demoStore.ts` + `fixtures/demoData.ts`.
`dataverseClient.ts` already short-circuits to `demoStore` when `isDemoModeActive()` is true.

In `src/main.tsx`:
- Change `setDemoMode(false)` to `setDemoMode(true)`
- Keep `setImpersonatingUser(false)`

That single line flips the entire data layer from Dataverse to in-memory mocks.

### 2. Remove the `@microsoft/power-apps` SDK dependency

- Remove `"@microsoft/power-apps": "^1.1.1"` from `package.json` dependencies
- Audit imports of `@microsoft/power-apps`:
  - `lib/dataverseClient.ts` — `getApiClient` / sdk init: wrap or short-circuit so it
    never executes when demo mode is on (it already mostly does — verify every export
    path returns early before touching the SDK)
  - `lib/deepLink.ts` — `getContext()`: stub to return null/empty values; deep link
    builder should return null so the "Copy Link" button hides
  - `lib/graphClient.ts` — replace all exports with no-op functions returning empty arrays
  - `lib/sharePointClient.ts` — already gated by demo mode? if not, gate every export
    so calls become no-ops that resolve with empty results
  - `lib/schedulingClient.ts` (PSS) — same: gate every PSS write to a resolved
    no-op that mutates `demoStore` if needed for UI feedback

Goal: every import of `@microsoft/power-apps` must be removable. If any client still
references it after gating, leave a TODO comment and create a minimal local type shim
in `src/lib/powerAppsShim.ts` rather than installing the package.

### 3. Mira AI — stub mode

`src/ai/*` and `components/mira/*` reference Copilot Studio.

- Replace the Mira chat panel body with a friendly "AI assistant unavailable in
  Azure preview build" empty state. Keep the panel UI shell visible so the template
  still demos.
- Stub `ai/mutations.ts` so `createBugReportRecord` / `createEnhancementSuggestionRecord`
  resolve to a fake ID without calling Dataverse.
- Do not delete Mira files — just neutralize their effects.

### 4. ConfigurationProvider

`src/providers/ConfigurationProvider.tsx` reads `pmo_appsetting` from Dataverse.
- When demo mode is on (which is always now), it should resolve to a static default
  config object. There should already be a default fallback in there — confirm and use it.
- `useEffectiveAdminRole()` should resolve to `'system_admin'` in this build so all
  admin nav and routes are visible (this is a demo of the full template).

### 5. Power Automate / cloud flows

All flow invocations live behind `dataverseClient.executeAction(...)` or via the
SharePoint upload custom API. Demo mode already bypasses these. Confirm — no further
action needed.

## Azure Static Web Apps wiring

### Files to add

**`staticwebapp.config.json`** (repo root):
```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "*.{css,js,svg,png,ico,json}"]
  },
  "responseOverrides": {
    "404": { "rewrite": "/index.html", "statusCode": 200 }
  },
  "mimeTypes": {
    ".json": "application/json"
  }
}
```

**`.github/workflows/azure-static-web-apps.yml`** — DO NOT create this manually.
Azure generates it automatically when the SWA resource is provisioned and the GitHub
repo is connected. Just leave a placeholder note in the README that the engineer
should expect Azure to commit the workflow.

### vite.config.ts

Current `base: './'` is fine for SWA. No change needed.

### Router

Leave `HashRouter` as-is. It works on SWA with zero config. Switching to BrowserRouter
is out of scope for this pass.

## Build verification

Once edits are done, run from the project root:

```
npm install
npx tsc -b --noEmit       # MUST be zero errors
npm run build              # MUST produce dist/
npm run dev                # Smoke-test in browser at http://localhost:3000
```

If TypeScript complains about missing `@microsoft/power-apps` types after removal,
add ambient declarations in `src/types/power-apps-shim.d.ts`:

```ts
declare module '@microsoft/power-apps/app';
declare module '@microsoft/power-apps' {
  export const getApiClient: any;
  export const getContext: any;
}
```

## Smoke test checklist

When done, the engineer should be able to:
- [ ] `npm run dev` and see the dashboard at `localhost:3000`
- [ ] Navigate to every top-level page in the sidebar — no white screen, no console errors that block render
- [ ] Open a project from the project list and see tabs/board/list
- [ ] Open the intake wizard
- [ ] Open admin settings (admin nav must be visible since we forced `system_admin`)
- [ ] Mira panel opens and shows the "unavailable in Azure preview" empty state
- [ ] `npm run build` succeeds
- [ ] Serving `dist/` via `npx vite preview` works the same as dev

## README

Create a fresh root `README.md` explaining:
- What this is (Azure SWA build of the CFR PMO template)
- How to run locally (`npm install` + `npm run dev`)
- That all data is in-memory mocks from `src/fixtures/demoData.ts`
- That this is a template / UI demo, not a production Baker Tilly application
- For deployment to Azure on any tenant, **point readers at `DEPLOYMENT.md`**.
  Do NOT duplicate the deployment steps in the README — `DEPLOYMENT.md` is the
  single source of truth for Azure setup. Keep README short.

## DEPLOYMENT.md — already exists, do not edit

A `DEPLOYMENT.md` file is already present at the repo root with full step-by-step
Azure Static Web Apps setup instructions covering:
- Local build verification
- Pushing to GitHub
- Creating the SWA resource in Azure Portal (on any tenant)
- Verifying the live URL
- Iteration workflow (`git push` → auto-deploy)
- Optional: custom domain, Entra ID auth lockdown
- Cost, troubleshooting, teardown

**Do NOT modify, overwrite, or duplicate `DEPLOYMENT.md`.** The engineer maintains
it. Only reference it from the README.

## Files NOT to touch

- `src/components/ui/**` — shadcn primitives
- `src/components/layout/**` — AppShell, Sidebar, Header (unless `AppShell.tsx`
  imports something Power Platform-specific that breaks the build — then minimum
  necessary edit only)
- All page components under `src/pages/**`
- All Tailwind / theme files
- `index.css`, `App.css`

## When done

Print a short summary of:
1. Files modified (with paths)
2. Files added (with paths)
3. Any remaining TODOs or risks
4. The exact commands to run locally to verify

Then stop. Do not commit, do not init git, do not push. The engineer will handle
git + Azure Portal setup themselves.
