/**
 * main.jsx - Entry point of React app.
 *
 * Mounts the App component to the #root DOM element.
 * StrictMode helps detect side-effects and deprecated APIs in development.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Mount app to the <div id="root"> tag in index.html
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
