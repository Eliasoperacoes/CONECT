import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {iniciarTema} from './servicos/tema';
import {iniciarNuvem} from './servicos/nuvem';
import './index.css';

// Restaura o tema escolhido antes de renderizar, evitando piscar o tema errado.
iniciarTema();

// Recupera a sessão e preenche o cache a partir do banco. Não bloqueia a
// renderização: a tela abre com o que já está em cache e se atualiza sozinha.
iniciarNuvem();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
