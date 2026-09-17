-- ============================================================
-- POR QUE O CADASTRO NÃO GRAVA
--
-- Este script TENTA inserir um colaborador exatamente como o aplicativo
-- faz, captura o erro e DESFAZ tudo no fim. Nada fica no banco.
--
-- É para parar de adivinhar: o erro que aparecer aqui é o mesmo que o
-- aplicativo está recebendo e engolindo.
-- ============================================================

do $$
declare
  mensagem text;
  detalhe  text;
  codigo   text;
begin
  begin
    insert into public.colaboradores (
      id, nome, login, cargo, setor, loja, nivel, foto, presenca,
      visto_por_ultimo, ramal, telefone, email, matricula, cnpj,
      departamento, data_admissao, observacoes,
      carga_horaria_diaria_minutos, ativo, turno, responsavel_id
    ) values (
      'teste-de-cadastro-temporario',
      'Teste Temporario',
      'teste.temporario.apagar',
      'Colaborador',
      'Balcão',
      'Pirassununga',
      1,
      '/logo-malachias.svg',
      'disponivel',
      'Agora',
      '', '', '', '', null,
      null, '', '',
      490, true, 'A', null
    );

    raise notice 'INSERIU SEM ERRO — o banco aceita o cadastro.';
  exception when others then
    get stacked diagnostics
      mensagem = message_text,
      detalhe  = pg_exception_detail,
      codigo   = returned_sqlstate;
    raise notice 'RECUSADO [%]: % | %', codigo, mensagem, coalesce(detalhe, 'sem detalhe');
  end;

  -- Não deixa rastro: era só um teste
  delete from public.colaboradores where id = 'teste-de-cadastro-temporario';
end $$;

-- ============================================================
-- O QUE MAIS PODE ESTAR NO CAMINHO
-- ============================================================

-- 1. As colunas que o banco EXIGE e o aplicativo pode não estar mandando
select
  column_name  as coluna,
  data_type    as tipo,
  column_default as valor_padrao
from information_schema.columns
where table_schema = 'public'
  and table_name = 'colaboradores'
  and is_nullable = 'NO'
order by ordinal_position;

-- 2. As regras de gravação da tabela. Para INSERT o esperado é
--    cuido_de_pessoas(), e você é TI — então deve passar.
select
  policyname  as regra,
  cmd         as operacao,
  with_check  as exige_para_gravar
from pg_policies
where tablename = 'colaboradores'
order by cmd;

-- 3. Quem o banco acha que é você nesta sessão do editor.
--    ATENÇÃO: no SQL Editor você roda como dono do banco, então a RLS não
--    se aplica aqui. Se o insert acima passou e o aplicativo falha, a causa
--    é permissão — e não estrutura.
select
  public.meu_colaborador_id() as meu_id_no_banco,
  public.meu_nivel()          as meu_nivel,
  public.cuido_de_pessoas()   as cuido_de_pessoas;
