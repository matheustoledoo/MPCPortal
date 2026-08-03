-- =====================================================================
-- PortalMPC — 0007 — RPCs de apoio (dashboard e verificação de acesso)
-- =====================================================================

-- Estatísticas gerais — SECURITY INVOKER: respeita a RLS do chamador.
create or replace function public.legalizacao_estatisticas()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'total_empresas',       (select count(*) from public.legalizacao_empresas),
    'ativas',               (select count(*) from public.legalizacao_empresas where upper(status) = 'ATIVO'),
    'inativas',             (select count(*) from public.legalizacao_empresas where upper(status) <> 'ATIVO'),
    'necessitam_revisao',   (select count(*) from public.legalizacao_empresas where necessita_revisao),
    'cnpj_invalido',        (select count(*) from public.legalizacao_empresas where not cnpj_valido),
    'sem_alvara',           (select count(*) from public.legalizacao_empresas where upper(coalesce(alvara, '')) in ('NÃO', 'NAO')),
    'com_alvara',           (select count(*) from public.legalizacao_empresas where upper(coalesce(alvara, '')) = 'SIM'),
    'por_origem',           (select coalesce(jsonb_object_agg(origem, qtd), '{}'::jsonb)
                             from (select origem::text as origem, count(*) as qtd
                                   from public.legalizacao_empresas group by 1) o),
    'por_cidade',           (select coalesce(jsonb_agg(jsonb_build_object('cidade', cidade, 'total', qtd) order by qtd desc), '[]'::jsonb)
                             from (select coalesce(cidade, 'Não informado') as cidade, count(*) as qtd
                                   from public.legalizacao_empresas group by 1 order by 2 desc limit 10) c),
    'por_tributacao',       (select coalesce(jsonb_agg(jsonb_build_object('tributacao', tributacao, 'total', qtd) order by qtd desc), '[]'::jsonb)
                             from (select coalesce(tributacao, 'Não informado') as tributacao, count(*) as qtd
                                   from public.legalizacao_empresas group by 1) t),
    'por_seguimento',       (select coalesce(jsonb_agg(jsonb_build_object('seguimento', seguimento, 'total', qtd) order by qtd desc), '[]'::jsonb)
                             from (select coalesce(nullif(btrim(seguimento), ''), 'Não informado') as seguimento, count(*) as qtd
                                   from public.legalizacao_empresas group by 1 order by 2 desc limit 12) s),
    'vencimentos_proximos', (select coalesce(jsonb_agg(v order by (v ->> 'validade')), '[]'::jsonb)
                             from (
                               select jsonb_build_object(
                                        'id', id, 'razao_social', razao_social, 'documento', doc,
                                        'validade', validade
                                      ) as v
                               from (
                                 select id, razao_social, 'AVCB/CLCB' as doc, avcb_clcb_validade as validade
                                 from public.legalizacao_empresas where avcb_clcb_validade is not null
                                 union all
                                 select id, razao_social, 'Vigilância Sanitária', vigilancia_sanitaria_validade
                                 from public.legalizacao_empresas where vigilancia_sanitaria_validade is not null
                                 union all
                                 select id, razao_social, 'Responsável Técnico', validade_data
                                 from public.legalizacao_empresas where validade_data is not null
                               ) uni
                               where validade <= (current_date + interval '180 days')
                               order by validade
                               limit 25
                             ) x)
  );
$$;

grant execute on function public.legalizacao_estatisticas() to authenticated;

-- Estatísticas financeiras — exclusivas de admin.
create or replace function public.admin_estatisticas_financeiras()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'registros',            count(*),
    'faturamento_mensal',   coalesce(sum(valor_honorario), 0),
    'ticket_medio',         coalesce(round(avg(nullif(valor_honorario, 0)), 2), 0),
    'maior_honorario',      coalesce(max(valor_honorario), 0),
    'sem_honorario',        count(*) filter (where coalesce(valor_honorario, 0) = 0),
    'por_vencimento',       (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', qtd) order by dia), '[]'::jsonb)
                             from (select dia_vencimento as dia, count(*) as qtd
                                   from public.legalizacao_dados_administrativos
                                   where dia_vencimento is not null group by 1) d)
  )
  into v
  from public.legalizacao_dados_administrativos;

  return v;
end;
$$;

grant execute on function public.admin_estatisticas_financeiras() to authenticated;

-- Sonda de segurança: quantos registros administrativos o chamador enxerga.
-- Serve de evidência automatizada de que a RLS está ativa.
create or replace function public.verificar_acesso_administrativo()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'usuario',              (select auth.uid()),
    'is_admin',             public.is_admin(),
    'area',                 public.user_area(),
    'role',                 public.user_role(),
    'empresas_visiveis',    (select count(*) from public.legalizacao_empresas),
    'dados_adm_visiveis',   (select count(*) from public.legalizacao_dados_administrativos),
    'logs_auditoria_visiveis', (select count(*) from public.audit_logs)
  );
$$;

grant execute on function public.verificar_acesso_administrativo() to authenticated;
