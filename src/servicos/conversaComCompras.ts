/**
 * A CONVERSA DO VENDEDOR COM COMPRAS: o mesmo id que o banco cria
 * (conversa_com_compras, cotador-banco.sql). Sem dependência nenhuma: o
 * lembrete do servidor (lembretesEncomendas.ts) também o usa.
 */
export const conversaComCompras = (vendedorId: string): string => `compras-${vendedorId}`;
