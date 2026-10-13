/**
 * O QUE FICA NO APARELHO DEPOIS DE "SAIR" — só o que é do aparelho.
 *
 * Laudo de 13/10/2026, item 2. O Sair apagava uma lista fixa de chaves, e
 * cada cache criado depois ficava de fora: no computador da loja, quem
 * sentava depois encontrava os atestados que o RH tinha aberto (dado de
 * saúde, LGPD), o banco de horas e as fichas da rede. E a senha de LOGIN
 * de quem entrou ficava gravada em texto puro, para o "acesso de um
 * clique" — também depois de sair.
 *
 * A LÓGICA SE INVERTE: apaga-se TUDO o que é do CONECTA, menos o que é
 * preferência do aparelho. Um cache novo nasce coberto, sem ninguém ter de
 * lembrar de incluí-lo aqui.
 */

/** Qual conta entrou por último neste aparelho — só o id, para preencher o login. */
export const CHAVE_ULTIMO_ACESSO_DISPOSITIVO = 'conecta_v4_ultimo_acesso_dispositivo';

/** O que é do APARELHO, e não de quem usou: sobrevive ao Sair. */
export const PREFERENCIAS_DO_APARELHO = new Set([
  'conecta_v4_tema',
  'conecta:biometria',
  'conecta_v4_avisos_mensagem',
  'conecta_convite_avisos_adiado_ate',
  'conecta_grupos_abertos',
  CHAVE_ULTIMO_ACESSO_DISPOSITIVO,
]);

const ehDoConecta = (chave: string): boolean => chave.startsWith('conecta');

/**
 * A senha de login nunca fica no aparelho. Até 13/10/2026 ela era gravada
 * junto com a conta; esta limpeza a remove de quem ainda a tem, e roda na
 * abertura do app e no Sair.
 */
export const apagarSenhaGuardada = (armazenamento: Storage = localStorage): void => {
  try {
    const bruto = armazenamento.getItem(CHAVE_ULTIMO_ACESSO_DISPOSITIVO);
    if (!bruto) return;
    const salvo = JSON.parse(bruto) as { id?: string; senha?: string };
    if (salvo && 'senha' in salvo) {
      if (salvo.id) armazenamento.setItem(CHAVE_ULTIMO_ACESSO_DISPOSITIVO, JSON.stringify({ id: salvo.id }));
      else armazenamento.removeItem(CHAVE_ULTIMO_ACESSO_DISPOSITIVO);
    }
  } catch {
    armazenamento.removeItem(CHAVE_ULTIMO_ACESSO_DISPOSITIVO);
  }
};

/** O Sair do modo rede: tudo do CONECTA vai embora, menos as preferências do aparelho. */
export const limparAoSair = (armazenamento: Storage = localStorage): void => {
  try {
    const chaves: string[] = [];
    for (let i = 0; i < armazenamento.length; i++) {
      const chave = armazenamento.key(i);
      if (chave && ehDoConecta(chave) && !PREFERENCIAS_DO_APARELHO.has(chave)) chaves.push(chave);
    }
    chaves.forEach((c) => armazenamento.removeItem(c));
    apagarSenhaGuardada(armazenamento);
  } catch {
    // Sem armazenamento: não havia o que deixar para trás
  }
};
