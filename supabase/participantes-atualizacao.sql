-- ============================================================
-- CONECTA — A REGRA QUE FALTAVA EM `participantes`
--
-- POR QUE FIXAR, ARQUIVAR E EXCLUIR NÃO GRAVAVAM
--
-- A tabela `participantes` guarda, para cada pessoa, o que ela decidiu
-- sobre cada conversa: fixada, arquivada, excluída. Ela tinha regra de
-- LER, INSERIR e APAGAR — e nenhuma de ATUALIZAR.
--
-- Com a segurança por linha ligada, um `update` sem regra NÃO dá erro. Ele
-- simplesmente não encontra nenhuma linha para mudar e devolve sucesso.
--
-- Por isso o sintoma era esse: excluir funcionava na tela, e a próxima
-- sincronização trazia tudo de volta. A escolha nunca saía do navegador.
--
-- Só a própria linha, nos dois lados: o `using` decide quais linhas a
-- pessoa alcança, e o `with check` impede que ela entregue a linha para
-- outra pessoa ao gravar. Sem o segundo, daria para mexer na lista do
-- colega.
--
-- Pode rodar mais de uma vez sem quebrar nada.
-- ============================================================

drop policy if exists participantes_atualizacao on public.participantes;
create policy participantes_atualizacao on public.participantes
  for update to authenticated
  using (colaborador_id = public.meu_colaborador_id())
  with check (colaborador_id = public.meu_colaborador_id());

notify pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA
--
-- Tem que aparecer QUATRO linhas: DELETE, INSERT, SELECT e UPDATE.
-- A de UPDATE é a nova. Se ela não aparecer, nada mudou.
-- ============================================================
select
  cmd         as operacao,
  policyname  as regra
from pg_policies
where tablename = 'participantes'
order by cmd;
