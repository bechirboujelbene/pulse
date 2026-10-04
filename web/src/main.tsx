import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installDemo } from './demo'
import './styles.css'

if (import.meta.env.VITE_DEMO === 'true') {
  installDemo()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
