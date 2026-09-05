import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ActivateApp } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ActivateApp />
  </StrictMode>,
);
