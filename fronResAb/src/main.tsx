import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
//import './index.css'
import App from './App.tsx'
import {Analyzer} from './components/index.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Analyzer />
  </StrictMode>,
)
