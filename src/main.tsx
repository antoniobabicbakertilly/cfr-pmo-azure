import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setImpersonatingUser } from './lib/adminImpersonation'
import { setDemoMode } from './lib/demoMode'

// Defaults on every app boot:
//   - Admin "act as user" impersonation OFF (admins start as admins)
//   - Demo mode OFF (all users start in real-data mode)
// Both toggles are still flippable from the UI during the session; they just
// don't persist across reloads.
setImpersonatingUser(false)
setDemoMode(true)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
