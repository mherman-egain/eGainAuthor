import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import '@/styles/global.css'
import App from './App.tsx'

/**
 * Subdirectory S3/CloudFront deploys (BASE_URL !== '/') use HashRouter so
 * reloads never request /login or trailing-slash paths that S3 rejects with
 * Access Denied. Local/dev keeps BrowserRouter + clean URLs.
 */
const base = import.meta.env.BASE_URL
const useHashRouter = base !== '/'
const basename = useHashRouter
  ? undefined
  : base.replace(/\/$/, '') || undefined

const Router = useHashRouter ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router basename={basename}>
      <App />
    </Router>
  </StrictMode>,
)
