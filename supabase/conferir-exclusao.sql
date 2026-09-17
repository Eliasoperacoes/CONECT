-- ============================================================
-- CONECTA — A EXCLUSÃO DE CONVERSA ESTÁ CHEGANDO AO BANCO?
--
-- POR QUE A VERSÃO ANTERIOR DEU TUDO ZERO
--
-- Ela filtrava por `meu_colaborador_id()`. No SQL Editor você roda como
-- DONO DO BANCO, e ali `auth.uid()` é nulo — a função não acha ninguém e
-- o filtro compara com vazio. Zero linhas, e nada a ver com o problema.
--
-- Aqui a pessoa é encontrada pelo LOGIN, que funciona no editor.
--
-- COMO USAR
--   1. No sistema, exclua UMA conversa agora (não precisa ser todas).
--   2. Rode este arquivo.
--   3. Me mande as tabelas 2 e 3.
--
-- Só leitura, fora a regra da parte 1 — que pode ser rodada quantas vezes
-- precisar.
-- ============================================================

-- ------------------------------------------------------------
-- 1. GARANTE A REGRA (caso o arquivo anterior não tenha rodado)
-- ------------------------------------------------------------
drop policy if exists participantes_atualizacao on public.participantes;
create policy participantes_atualizacao on public.participantes
  for update to authenticated
  using (colaborador_id = public.meu_colaborador_id())
  with check (colaborador_id = public.meu_colaborador_id());

notify pgrst, 'reload schema';

-- ------------------------------------------------------------
-- 2. O NÚMERO QUE RESPONDE TUDO
--
-- Conta as marcas de exclusão da REDE INTEIRA, sem depender de saber quem
-- é você. Depois de excluir uma conversa, `excluidas` tem que ser >= 1.
--
-- Se vier 0 com participantes > 0, a gravação não está chegando — e aí é
-- permissão, não resíduo.
-- ------------------------------------------------------------
select
  count(*)                          as linhas_de_participante,
  count(*) filter (where removida)  as excluidas,
  count(*) filter (where fixada)    as fixadas,
  count(*) filter (where oculta_desde is not null) as arquivadas
from public.participantes;

-- ------------------------------------------------------------
-- 3. AS SUAS CONVERSAS, UMA A UMA
--
-- >>> Se o seu login não for "Elias", troque nas DUAS linhas marcadas <<<
--
-- `tem_mensagem = false` explica um caso legítimo: conversa sem nenhuma
-- mensagem nunca foi gravada no banco e nem aparece aqui. Nessas, a
-- exclusão vale só no aparelho, e está correto.
-- ------------------------------------------------------------
select
  c.nome            as conversa,
  p.removida,
  p.fixada,
  p.oculta_desde,
  exists (select 1 from public.mensagens m where m.conversa_id = c.id) as tem_mensagem
from public.participantes p
join public.conversas c on c.id = p.conversa_id
where p.colaborador_id = (
  select id from public.colaboradores
   where lower(trim(login)) = lower(trim('Elias'))   -- <<< TROQUE AQUI
   limit 1
)
order by p.removida desc, c.nome;

-- ------------------------------------------------------------
-- 4. CONFERE QUE ACHOU VOCÊ
--
-- Se vier vazio, o login da linha acima está errado e a tabela 3 não
-- significa nada.
-- ------------------------------------------------------------
select id, nome, login, nivel
from public.colaboradores
where lower(trim(login)) = lower(trim('Elias'));       -- <<< TROQUE AQUI
