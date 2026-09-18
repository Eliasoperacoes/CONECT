/**
 * Período de teste — CONECTA
 *
 * Quem encontra um defeito e não sabe que o sistema está em teste conclui
 * que "é assim mesmo", para de tentar e volta para o grupo do WhatsApp. O
 * defeito continua lá, e ninguém fica sabendo dele.
 */
import { test, expect } from 'bun:test';

test('a faixa e ligada pela rede, e nao por aparelho', async () => {
  const ponte = await Bun.file(
    new URL('./nuvemComunicacao.ts', import.meta.url)
  ).text();

  /**
   * Precisa aparecer para as 88 pessoas, não só para quem clicou no
   * interruptor — então mora nas configurações da rede, e sobe e desce do
   * banco como as outras.
   */
  expect(ponte).toContain('emPeriodoDeTeste: data.em_periodo_de_teste ?? false');
  expect(ponte).toContain('em_periodo_de_teste: config.emPeriodoDeTeste ?? false');

  const sql = await Bun.file(
    new URL('../../supabase/periodo-de-teste.sql', import.meta.url)
  ).text();
  // Nasce DESLIGADO: ligar é uma decisão, não um padrão
  expect(sql).toContain('boolean not null default false');
  expect(sql).toContain("notify pgrst, 'reload schema'");
});

test('a faixa so aparece quando ligada', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();
  expect(app).toContain('bancoDados.obterConfiguracoes().emPeriodoDeTeste && (');
});

test('a faixa leva a pessoa a QUEM resolve, e nao so avisa', async () => {
  const app = await Bun.file(new URL('../App.tsx', import.meta.url)).text();

  /**
   * Aviso sem caminho de volta é só um aviso: a pessoa lê, concorda, e não
   * sabe para onde levar o defeito que acabou de encontrar.
   */
  expect(app).toContain('aoAvisarProblema=');
  expect(app).toContain('c.nivel >= NIVEL_TI && c.id !== colaboradorAtual.id');
  expect(app).toContain('lidarSelecionarColega(cuidador.id)');
});

test('a faixa e discreta e pode ser fechada', async () => {
  const faixa = await Bun.file(
    new URL('../componentes/FaixaDeTeste.tsx', import.meta.url)
  ).text();

  /**
   * Ela fica em cima de tudo o dia inteiro, em 88 telas. Uma tarja grande
   * viraria ruído em dois dias, e em três a pessoa deixaria de enxergá-la —
   * inclusive na hora em que precisasse dela.
   */
  expect(faixa).toContain("text-[11px]");
  expect(faixa).toContain('setFechada(true)');

  // Fechar vale só naquela sessão: o período de teste continua
  expect(faixa).toContain('useState(false)');
  expect(faixa).not.toContain('localStorage');
});
