# Azure Static Web Apps — Deployment Guide

This document explains how to deploy this project to Azure on **any tenant**
(personal MSDN, MPN, customer tenant, etc. — not just the CVS tenant).

> The app is a pure static SPA — no backend, no database, no auth. All data is
> in-memory mocks from `src/fixtures/demoData.ts`. Anyone with the URL can use it.

---

## Prerequisites

| Item | Why | Where to get it |
|---|---|---|
| Azure subscription on the target tenant | Hosts the SWA resource | Azure Portal — Free tier is enough |
| GitHub account | SWA pulls from GitHub on push | github.com |
| GitHub repo containing this project | Source of truth Azure deploys from | See "Step 1" below |
| Node 20+ locally | Verifying the build before pushing | nodejs.org or `nvm` |

You do **NOT** need:
- Azure CLI (Portal-only flow works fine)
- Service principals / Entra app registrations
- Any Power Platform / Dataverse access

---

## Step 0 — Verify the build locally

Before pushing anything, confirm the project builds clean:

```bash
cd C:\Users\C976089\Documents\corp-fin-bi-pmo-azure
npm install
npx tsc -b --noEmit       # must be zero errors
npm run build              # must produce dist/
npm run dev                # smoke-test at http://localhost:3000
```

If any of these fail, fix locally before deploying. Azure builds the same way
on its runner — if it doesn't build here, it won't build there.

---

## Step 1 — Push to a new GitHub repo

The repo can live on your personal GitHub account, an org, or anywhere `gh` /
`git` can push.

```bash
cd C:\Users\C976089\Documents\corp-fin-bi-pmo-azure
git init
git add .
git commit -m "Initial commit — CFR PMO Azure SWA build"

# Create the repo on GitHub (using gh CLI):
gh repo create cfr-pmo-azure --public --source=. --remote=origin --push

# OR manually:
# 1. Create empty repo on github.com
# 2. git remote add origin https://github.com/<you>/cfr-pmo-azure.git
# 3. git branch -M main
# 4. git push -u origin main
```

> **Important on a different tenant:** the GitHub account does NOT need to match
> the Azure tenant. Azure SWA uses GitHub OAuth at provisioning time, then commits
> a deployment token + workflow to your repo. After that, Azure only reads from
> GitHub — no tenant coupling.

---

## Step 2 — Create the Static Web App in Azure Portal

1. Sign in to https://portal.azure.com on the target tenant
2. Top search → **Static Web Apps** → **+ Create**
3. Fill in the form:

| Field | Value |
|---|---|
| **Subscription** | Whatever subscription you want billed (Free tier = $0) |
| **Resource group** | Create new: `rg-cfr-pmo` (or use existing) |
| **Name** | `cfr-pmo-<yourinitials>` (must be globally unique) |
| **Plan type** | **Free** |
| **Region** | Closest to you (e.g. East US 2, Central US) |
| **Source** | **GitHub** |

4. Click **Sign in with GitHub** → authorize Azure if prompted
5. Pick the **Organization**, **Repository**, and **Branch** you just created
6. **Build presets:** select **React**
7. **App location:** `/`
8. **Api location:** *(leave blank)*
9. **Output location:** `dist`
10. Click **Review + create** → **Create**

Azure provisions the resource (~30s) and:
- Generates a deployment token
- Commits `.github/workflows/azure-static-web-apps-<random>.yml` to your repo's `main` branch
- The new workflow auto-triggers **and will fail on its first run**
- Live URL appears on the SWA Overview page once the build finishes (~2-3 min)

> **⚠️ Required manual fix after Azure commits the workflow:**
>
> Azure always auto-generates `output_location: "build"` (the Create React App default)
> regardless of what you typed in the portal. This project uses Vite, which outputs to `dist`.
> You must fix the workflow before the build succeeds:
>
> 1. `git pull origin master` (or `main`) — pulls the Azure-committed workflow file
> 2. Open `.github/workflows/azure-static-web-apps-<random>.yml`
> 3. Change `output_location: "build"` → `output_location: "dist"`
> 4. `git add . && git commit -m "fix: output_location dist" && git push`
>
> The second run will succeed.

---

## Step 3 — Verify the deployment

1. In the Azure Portal → your SWA → **Overview** → copy the **URL**
   (format: `https://<random-name>.azurestaticapps.net`)
2. Open it in a browser
3. You should see the dashboard with mock data
4. Click around — every sidebar route should render

---

## Step 4 — Iterating on the app

Every `git push` to `main` triggers a fresh build + deploy automatically.

```bash
# After making changes:
git add .
git commit -m "feat: <whatever>"
git push
```

Watch the build in **GitHub → Actions** tab. Failed builds show typescript /
vite errors directly in the log.

---

## SPA routing — already configured

`staticwebapp.config.json` at the repo root tells SWA to fall back unknown routes
to `index.html` so HashRouter works without 404s. Do not delete this file.

---

## Optional — Custom domain

Free tier supports one custom domain.

1. Azure Portal → your SWA → **Custom domains** → **+ Add**
2. Pick **TXT validation** (no DNS provider lock-in)
3. Add the TXT record at your DNS provider
4. Once validated, add a CNAME → `<your-swa>.azurestaticapps.net`
5. Azure auto-provisions a free TLS cert (~5 min)

---

## Optional — Lock it down with Entra ID auth

By default the app is anonymous (public). To require login:

1. Edit `staticwebapp.config.json` and add:
   ```json
   {
     "routes": [
       { "route": "/*", "allowedRoles": ["authenticated"] }
     ]
   }
   ```
2. Commit + push
3. SWA now redirects unauthenticated visitors to `/login/aad`
   (uses SWA's built-in Entra integration — no app registration needed)

This is a 5-minute change. Skip it for the first deploy; add it later if you
want to lock the demo to your tenant.

---

## Cost

**$0** on the Free tier. Includes:
- 100 GB bandwidth / month
- 0.5 GB storage
- 2 staging environments
- Free TLS certs
- Custom domain support

You will only get billed if you upgrade to Standard ($9/mo) — needed for
private endpoints, larger apps, or SLA. Don't upgrade unless you need it.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails on Azure with "tsc errors" but succeeds locally | Different Node version. Azure SWA defaults to Node 18; force Node 20 by adding `"engines": { "node": "20.x" }` to `package.json` |
| 404 on direct URL like `/projects/123` | Confirm `staticwebapp.config.json` is at the repo root and committed |
| White screen, no errors | Open DevTools console — usually a missing import or env var. The app is fully static, so no env vars are required |
| GitHub Action shows "Deployment token not found" | The workflow file references a secret. Check **Settings → Secrets and variables → Actions** in GitHub — Azure auto-creates `AZURE_STATIC_WEB_APPS_API_TOKEN_<random>` |
| Need to re-link a different repo | Azure Portal → SWA → **Deployment** → **Manage deployment token** → regenerate, then re-link |

---

## Tearing it down

Azure Portal → Resource Group `rg-cfr-pmo` → **Delete resource group**.
That removes everything (~1 min). The GitHub repo and workflow stay; you can
delete them separately if you want.
