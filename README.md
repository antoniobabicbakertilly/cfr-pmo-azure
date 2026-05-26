# Baker Tilly CFR PMO — Azure Static Web App

A standalone Azure Static Web App build of the Baker Tilly CFR PMO template. All data is served from in-memory mocks — no Dataverse, no Power Platform, no backend required.

## Running locally

```bash
npm install
npm run dev
```

The app opens at `http://localhost:3000`.

## About this build

- All data comes from `src/fixtures/demoData.ts` — no network calls are made.
- This is a UI template demo, not a production Baker Tilly application.
- The Mira AI assistant panel shows a preview placeholder; full AI features require the Power Platform environment.
- Admin navigation is fully visible (forced to `system_admin` role) so the complete template can be demoed.

## Deploying to Azure

See [DEPLOYMENT.md](./DEPLOYMENT.md) for step-by-step Azure Static Web Apps setup instructions.
