/**
 * OS CUPONS DE PRIMEIRO ACESSO — para recortar e entregar em mão.
 *
 * Desde 13/10/2026 cada pessoa que ainda não entrou tem a SUA senha de
 * primeiro acesso, sorteada no banco (senha-de-ativacao-aleatoria.sql), e
 * não existe mais senha padrão. O RH imprime estes cupons quando a rede
 * cresce, como foi feito na primeira leva.
 *
 * As senhas vêm de `senhas_para_entregar()`, que só entrega a quem cuida
 * de pessoas. Este arquivo só desenha: dez cupons por folha A4, com linha
 * de recorte, e a senha em letra que não se confunde.
 */
import { montarDocumento, emitidoHoje } from './documento';

export interface CupomDeAcesso {
  nome: string;
  login: string;
  loja: string;
  setor: string;
  senha: string;
}

const escapar = (texto: string): string =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ESTILO_DOS_CUPONS = `
  .cupons { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .cupom { border: 1px dashed #9aa3af; padding: 12px 14px; break-inside: avoid; page-break-inside: avoid; }
  .cupom .marca { font-size: 9px; letter-spacing: .08em; text-transform: uppercase; color: #315BAA; font-weight: 700; }
  .cupom .nome { font-size: 13px; font-weight: 700; margin-top: 4px; }
  .cupom .onde { font-size: 10px; color: #4b5563; }
  .cupom .linha { display: flex; justify-content: space-between; align-items: baseline; margin-top: 6px; font-size: 10px; color: #4b5563; }
  .cupom .valor { font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; color: #111827; letter-spacing: .06em; }
  .cupom .endereco { font-family: 'Courier New', monospace; font-size: 10px; color: #111827; }
  .cupom .aviso { margin-top: 6px; font-size: 8.5px; color: #6b7280; line-height: 1.35; }
`;

/** A página dos cupons, pronta para `imprimirDocumento`. */
export const documentoDosCupons = (cupons: CupomDeAcesso[], endereco: string): string => {
  const sem = endereco.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const corpo = `
    <p style="font-size:10px;color:#6b7280;margin:0 0 8px">
      Cupons de primeiro acesso · ${cupons.length} ${cupons.length === 1 ? 'pessoa' : 'pessoas'} · emitido ${emitidoHoje()}.
      Recorte na linha tracejada e entregue cada um em mão.
    </p>
    <div class="cupons">
      ${cupons
        .map(
          (c) => `
        <div class="cupom">
          <div class="marca">CONECTA · Malachias Autopeças</div>
          <div class="nome">${escapar(c.nome)}</div>
          <div class="onde">${escapar(c.setor)} · Loja ${escapar(c.loja)}</div>
          <div class="linha"><span>Endereço</span><span class="endereco">${escapar(sem)}</span></div>
          <div class="linha"><span>Login</span><span class="valor">${escapar(c.login)}</span></div>
          <div class="linha"><span>Senha de primeiro acesso</span><span class="valor">${escapar(c.senha)}</span></div>
          <div class="aviso">Vale só para a primeira entrada: nela você cria a sua senha. Não mostre este cupom a ninguém.</div>
        </div>`
        )
        .join('')}
    </div>`;
  return montarDocumento({ titulo: 'Cupons de primeiro acesso', corpo, estiloExtra: ESTILO_DOS_CUPONS });
};
