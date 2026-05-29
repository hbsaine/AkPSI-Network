import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AKPsiDashboard from './AKPsiDashboard.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AKPsiDashboard />
  </StrictMode>,
)
