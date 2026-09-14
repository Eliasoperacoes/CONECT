import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {iniciarTema} from './servicos/tema';
import './index.css';

// Restaura o tema escolhido antes de renderizar, evitando piscar o tema errado.
iniciarTema();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
