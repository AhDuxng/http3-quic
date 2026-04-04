/**
 * main.jsx — Diem vao cua React app.
 *
 * Mount component App vao DOM element #root.
 * StrictMode giup phat hien side-effect va deprecated API trong dev.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Mount app vao the <div id="root"> trong index.html
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
