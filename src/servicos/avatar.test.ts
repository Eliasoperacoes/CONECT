/**
 * O AVATAR DE QUEM NÃO TEM FOTO. No S10 do Elias (02/10/2026) a lista era
 * uma coluna de logos iguais; quem não tem foto ganha iniciais sobre uma
 * cor, e o canal oficial mantém a logo.
 */
import { test, expect } from 'bun:test';
import { iniciaisDe, fotoParaMostrar, corDoAvatar, ehFotoDeVerdade, FOTO_DA_LOGO } from './avatar';

test('iniciais: primeiro e ultimo nome; o que esta entre parenteses nao conta', () => {
  expect(iniciaisDe('Leigislaine Alves Barbosa')).toBe('LB');
  expect(iniciaisDe('Descalvado (Filial 03)')).toBe('D');
  expect(iniciaisDe('TI & Operações — Rede')).toBe('TR');
  expect(iniciaisDe('ana')).toBe('A');
  expect(iniciaisDe('')).toBe('?');
});

test('a logo padrao vale como sem foto, menos no canal oficial', () => {
  expect(ehFotoDeVerdade(FOTO_DA_LOGO)).toBe(false);
  expect(fotoParaMostrar(FOTO_DA_LOGO, 'conv-ind-a-b')).toBeUndefined();
  expect(fotoParaMostrar(undefined, 'grupo-loja-palmeiras')).toBeUndefined();
  expect(fotoParaMostrar(FOTO_DA_LOGO, 'grupo-avisos-da-rede')).toBe(FOTO_DA_LOGO);
  expect(fotoParaMostrar('https://x/foto.jpg', 'conv-ind-a-b')).toBe('https://x/foto.jpg');
});

test('a cor e sempre a mesma para o mesmo nome, e varia entre nomes', () => {
  expect(corDoAvatar('Leigislaine Alves Barbosa')).toBe(corDoAvatar('Leigislaine Alves Barbosa'));
  const cores = new Set(
    ['Ana', 'Bia', 'Carlos', 'Davi', 'Edmur', 'Fabio', 'Gustavo', 'Isaque'].map(corDoAvatar)
  );
  expect(cores.size).toBeGreaterThan(3);
});

test('a lista, o cabecalho, os dados do grupo e a busca usam o mesmo Avatar', async () => {
  const ler = (n: string) => Bun.file(new URL(`../componentes/${n}`, import.meta.url)).text();
  expect(await ler('ItemConversa.tsx')).toContain('<Avatar foto={conversa.foto} nome={conversa.nome} id={conversa.id}');
  expect(await ler('FotoPresenca.tsx')).toContain('<Avatar foto={foto} nome={nome} id={conversaId} />');
  expect(await ler('DadosDoGrupo.tsx')).toContain('<Avatar foto={conversa.foto} nome={conversa.nome} id={conversa.id}');
  expect(await ler('ResultadosDaBusca.tsx')).toContain('<Avatar foto={c.foto} nome={c.nome} id={c.id} />');
});
