import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {iniciarTema} from './servicos/tema';
import {iniciarNuvem} from './servicos/nuvem';
import {calarSugestoesDoNavegador} from './servicos/sugestoesDoNavegador';
import {impedirQueArquivoSoltoAbra} from './servicos/arquivosSoltos';
import {vigiarErrosGlobais} from './servicos/registroDeErros';
import {ProtecaoDaTela} from './componentes/ProtecaoDaTela';
// A fonte do computador (index.css, a partir de 768px); o celular não a baixa
import '@fontsource-variable/manrope';
import './index.css';

// Restaura o tema escolhido antes de renderizar, evitando piscar o tema errado.
iniciarTema();

// Antes de desenhar: o primeiro campo já nasce sem a lista do navegador.
calarSugestoesDoNavegador();

// Arquivo solto fora de quem o recebe não troca o CONECTA pelo arquivo
impedirQueArquivoSoltoAbra();

// Os erros que nenhuma tela segurou vão para o registro do TI (erros-do-app.sql)
vigiarErrosGlobais();

// Recupera a sessão e preenche o cache a partir do banco. Não bloqueia a
// renderização: a tela abre com o que já está em cache e se atualiza sozinha.
iniciarNuvem();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* A última defesa: sem ela, um erro fora das telas deixava tudo em branco */}
    <ProtecaoDaTela nome="sistema" inteiro>
      <App />
    </ProtecaoDaTela>
  </StrictMode>,
);
