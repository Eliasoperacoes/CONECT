/**
 * Verificação da ponte de comunicação — CONECTA
 *
 * O caso que derrubou o celular em producão, medido no banco de verdade:
 *
 *   insert simples, sem Prefer    -> OK
 *   insert com ignore-duplicates  -> new row violates row-level security
 *   insert com merge-duplicates   -> new row violates row-level security
 *
 * Upsert vira `ON CONFLICT` no Postgres, e isso exige poder enxergar a linha
 * em conflito. A regra de `conversas` só deixa ler quem já participa dela —
 * então entrar num canal que outra pessoa criou era recusado, e com ele ia
 * embora o envio da mensagem inteiro.
 *
 * O cliente do Supabase aqui é falso, mas reproduz essa regra.
 */
import { test, expect, mock, beforeEach } from 'bun:test';

(globalThis as any).localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

let linhasConversas: any[] = [];
let linhasParticipantes: { conversa_id: string; colaborador_id: string }[] = [];
let euSou = 'colab-ana';

const souParticipante = (conversaId: string) =>
  linhasParticipantes.some((p) => p.conversa_id === conversaId && p.colaborador_id === euSou);

const ERRO_RLS = {
  code: '42501',
  message: 'new row violates row-level security policy',
};
const ERRO_DUPLICADA = { code: '23505', message: 'duplicate key value violates unique constraint' };

const clienteFalso = {
  from(tabela: string) {
    const gravar = (dados: any, ehUpsert: boolean) => {
      const linhas = Array.isArray(dados) ? dados : [dados];

      if (tabela === 'conversas') {
        for (const linha of linhas) {
          const jaExiste = linhasConversas.some((c) => c.id === linha.id);

          // ON CONFLICT precisa enxergar a linha alvo, e só participante lê
          if (ehUpsert && !souParticipante(linha.id)) {
            return Promise.resolve({ error: ERRO_RLS, data: null });
          }
          if (jaExiste) {
            if (ehUpsert) continue;
            return Promise.resolve({ error: ERRO_DUPLICADA, data: null });
          }
          linhasConversas.push({ ...linha });
        }
        return Promise.resolve({ error: null, data: null });
      }

      if (tabela === 'participantes') {
        for (const linha of linhas) {
          const repetida = linhasParticipantes.some(
            (p) =>
              p.conversa_id === linha.conversa_id && p.colaborador_id === linha.colaborador_id
          );
          if (repetida) {
            if (ehUpsert) continue;
            return Promise.resolve({ error: ERRO_DUPLICADA, data: null });
          }
          linhasParticipantes.push({ ...linha });
        }
        return Promise.resolve({ error: null, data: null });
      }

      return Promise.resolve({ error: null, data: null });
    };

    return {
      insert: (dados: any) => gravar(dados, false),
      upsert: (dados: any) => gravar(dados, true),
      select: () => ({
        // Só enxerga os participantes de conversa da qual já participa —
        // fora isso, apenas as próprias linhas
        eq: (_coluna: string, valor: string) =>
          Promise.resolve({
            data: linhasParticipantes.filter(
              (p) =>
                p.conversa_id === valor &&
                (souParticipante(valor) || p.colaborador_id === euSou)
            ),
            error: null,
          }),
      }),
    };
  },
};

mock.module('./supabase', () => ({
  supabase: clienteFalso,
  usandoNuvem: () => true,
  temSessaoViva: () => true,
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
  const res = await nuvemComunicacao.salvarConversa(CANAL_LOJA, 'colab-ana');

  expect(res.sucesso).toBe(true);
  expect(linhasConversas).toHaveLength(1);
  expect(linhasParticipantes).toHaveLength(2);
});

test('CELULAR: entra em canal que o computador já criou, sem participar ainda', async () => {
  // O computador criou o canal e só ele está dentro
  euSou = 'colab-elias';
  await nuvemComunicacao.salvarConversa(
    { ...CANAL_LOJA, participantesIds: ['colab-elias'] },
    'colab-elias'
  );
  expect(linhasParticipantes).toHaveLength(1);

  // Agora o celular da Ana, que ainda não participa de nada
  euSou = 'colab-ana';
  expect(souParticipante(CANAL_LOJA.id)).toBe(false);

  const res = await nuvemComunicacao.salvarConversa(CANAL_LOJA, 'colab-ana');

  // Era aqui que dava "violates row-level security policy"
  expect(res.sucesso).toBe(true);
  expect(souParticipante(CANAL_LOJA.id)).toBe(true);
});

test('conversa que já existe não é recriada nem reescrita', async () => {
  euSou = 'colab-elias';
  await nuvemComunicacao.salvarConversa(
    { ...CANAL_LOJA, participantesIds: ['colab-elias'] },
    'colab-elias'
  );

  euSou = 'colab-ana';
  await nuvemComunicacao.salvarConversa(
    { ...CANAL_LOJA, nome: 'Nome trocado pelo celular' },
    'colab-ana'
  );

  expect(linhasConversas).toHaveLength(1);
  expect(linhasConversas[0].nome).toBe('Loja Pirassununga');
});

test('entrar de novo não duplica nem falha', async () => {
  await nuvemComunicacao.salvarConversa(CANAL_LOJA, 'colab-ana');
  const res = await nuvemComunicacao.salvarConversa(CANAL_LOJA, 'colab-ana');

  expect(res.sucesso).toBe(true);
  expect(linhasParticipantes).toHaveLength(2);
  expect(linhasConversas).toHaveLength(1);
});

test('inscreve só quem falta quando alguém já está dentro', async () => {
  euSou = 'colab-elias';
  await nuvemComunicacao.salvarConversa(
    { ...CANAL_LOJA, participantesIds: ['colab-elias'] },
    'colab-elias'
  );

  euSou = 'colab-ana';
  const res = await nuvemComunicacao.salvarConversa(
    { ...CANAL_LOJA, participantesIds: ['colab-elias', 'colab-ana', 'colab-jose'] },
    'colab-ana'
  );

  expect(res.sucesso).toBe(true);
  expect(linhasParticipantes.map((p) => p.colaborador_id).sort()).toEqual([
    'colab-ana',
    'colab-elias',
    'colab-jose',
  ]);
});

test('conversa individual põe as duas pessoas dentro', async () => {
  const res = await nuvemComunicacao.salvarConversa(
    {
      id: 'conv-ind-colab-ana-colab-elias',
      tipo: 'individual',
      nome: 'Elias',
      participantesIds: ['colab-ana', 'colab-elias'],
      naoLidas: 0,
      atualizadoEm: '2026-09-15T08:00:00.000Z',
    },
    'colab-ana'
  );

  expect(res.sucesso).toBe(true);
  expect(linhasParticipantes.map((p) => p.colaborador_id).sort()).toEqual([
    'colab-ana',
    'colab-elias',
  ]);
});
