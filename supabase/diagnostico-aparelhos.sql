-- ============================================================
-- DIAGNÓSTICO: O APARELHO ESTÁ NA LISTA DE ENTREGA? (13/10/2026)
--
-- O aviso com o app fechado só chega ao aparelho que gravou o seu
-- endereço (o token do Firebase) em `aparelhos`. O token muda a cada
-- instalação: o APK 1.3 foi instalado hoje às 15:54, então o S10 só
-- recebe se aparecer aqui uma linha criada DEPOIS disso.
--
-- Só leitura. Não mexe em nada.
-- ============================================================
select
  c.nome,
  a.plataforma,
  to_char(a.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as criado_em,
  to_char(a.visto_em  at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as visto_em,
  left(a.token, 12) || '…' as inicio_do_token
from public.aparelhos a
left join public.colaboradores c on c.id = a.colaborador_id
order by a.visto_em desc
limit 10;
