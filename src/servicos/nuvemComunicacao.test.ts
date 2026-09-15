/**
 * Verificação da ponte de comunicação — CONECTA
 *
 * O caso que derrubou o celular em produção: a conversa já existia no banco,
 * criada pelo computador, e a pessoa ainda não era participante dela. Como a
 * gravação era um upsert, virava UPDATE — e a política de update exige já
 * participar da conversa. Impasse: para entrar no canal precisava atualizar a
 * conversa, e para atualizar a conversa precisava já estar no canal.
 *
 * Aqui o cliente do Supabase é falso, mas reproduz essa regra.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** Estado do banco falso. */
let linhasConversas: any[] = [];
let linhasParticipantes: { conversa_id: string; colaborador_id: string }[] = [];
let euSou = 'colab-ana';

const souParticipante = (conversaId: string) =>
  linhasParticipantes.some(
    (p) => p.conversa_id === conversaId && p.colaborador_id === euSou
  );

const ERRO_RLS = {
  code: '42501',
  message: 'new row violates row-level security policy for table "conversas"',
};

const clienteFalso = {
  from(tabela: string) {
    return {
      upsert(dados: any, opcoes?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        const linhas = Array.isArray(dados) ? dados : [dados];

        if (tabela === 'conversas') {
          for (const linha of linhas) {
            const jaExiste = linhasConversas.some((c) => c.id === linha.id);

            if (!jaExiste) {
              linhasConversas.push({ ...linha });
              continue;
            }

            // Linha existente: sem ignoreDuplicates isto é um UPDATE, e a
            // política só libera para quem já participa da conversa
            if (opcoes?.ignoreDuplicates) continue;
            if (!souParticipante(linha.id)) return Promise.resolve({ error: ERRO_RLS });

            const i = linhasConversas.findIndex((c) => c.id === linha.id);
            linhasConversas[i] = { ...linha };
          }
          return Promise.resolve({ error: null });
        }

        if (tabela === 'participantes') {
          for (const linha of linhas) {
            const repetida = linhasParticipantes.some(
              (p) =>
                p.conversa_id === linha.conversa_id &&
                p.colaborador_id === linha.colaborador_id
            );
            if (!repetida) linhasParticipantes.push({ ...linha });
          }
          return Promise.resolve({ error: null });
        }

        return Promise.resolve({ error: null });
      },
    };
  },
};

mock.module('./supabase', () => ({
  supabase: clienteFalso,
  usandoNuvem: () => true,
}));

const { nuvemComunicacao } = await import('./nuvemComunicacao');

const CANAL_LOJA = {
  id: 'grupo-loja-pirassununga',
  tipo: 'grupo' as const,
  nome: 'Loja Pirassununga',
  participantesIds: ['colab-elias', 'colab-ana'],
  naoLidas: 0,
  atualizadoEm: '2026-09-15T08:00:00.000Z',
  ehSistemaPadrao: true,
};

beforeEach(() => {
  linhasConversas = [];
  linhasParticipantes = [];
  euSou = 'colab-ana';
});

test('conversa nova é criada e os participantes entram junto', async () => {
  const res = await nuvemComunicacao.salvarConversa(CANAL_LOJA);

  expect(res.sucesso).toBe(true);
  expect(linhasConversas).toHaveLength(1);
  expect(linhasParticipantes).toHaveLength(2);
});

test('CELULAR: entra em canal que o computador já criou, sem ser participante ainda', async () => {
  // O computador criou o canal e só ele está dentro
  euSou = 'colab-elias';
  await nuvemComunicacao.salvarConversa({
    ...CANAL_LOJA,
    participantesIds: ['colab-elias'],
  });
  expect(linhasParticipantes).toHaveLength(1);

  // Agora o celular da Ana, que ainda não participa de nada
  euSou = 'colab-ana';
  expect(souParticipante(CANAL_LOJA.id)).toBe(false);

  const res = await nuvemComunicacao.salvarConversa(CANAL_LOJA);

  // Era aqui que dava "Falha ao abrir a conversa no banco"
  expect(res.sucesso).toBe(true);
  expect(souParticipante(CANAL_LOJA.id)).toBe(true);
});

test('a conversa existente não é reescrita ao entrar nela', async () => {
  euSou = 'colab-elias';
  await nuvemComunicacao.salvarConversa({ ...CANAL_LOJA, participantesIds: ['colab-elias'] });

  euSou = 'colab-ana';
  await nuvemComunicacao.salvarConversa({ ...CANAL_LOJA, nome: 'Nome trocado pelo celular' });

  expect(linhasConversas).toHaveLength(1);
  expect(linhasConversas[0].nome).toBe('Loja Pirassununga');
});

test('entrar duas vezes não duplica a linha de participante', async () => {
  await nuvemComunicacao.salvarConversa(CANAL_LOJA);
  await nuvemComunicacao.salvarConversa(CANAL_LOJA);

  expect(linhasParticipantes).toHaveLength(2);
  expect(linhasConversas).toHaveLength(1);
});

test('conversa individual entre duas pessoas põe as duas dentro', async () => {
  const res = await nuvemComunicacao.salvarConversa({
    id: 'conv-ind-colab-ana-colab-elias',
    tipo: 'individual',
    nome: 'Elias',
    participantesIds: ['colab-ana', 'colab-elias'],
    naoLidas: 0,
    atualizadoEm: '2026-09-15T08:00:00.000Z',
  });

  expect(res.sucesso).toBe(true);
  expect(linhasParticipantes.map((p) => p.colaborador_id).sort()).toEqual([
    'colab-ana',
    'colab-elias',
  ]);
});
