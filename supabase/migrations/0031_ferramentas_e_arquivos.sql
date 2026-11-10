-- =====================================================================
-- PortalMPC — 0031 — Ferramentas (tabelas das calculadoras) e arquivos
-- ---------------------------------------------------------------------
-- 1. `ferramentas_tabelas`: as regras que as calculadoras usam ficam no
--    banco, com vigência, legislação e link da fonte. Atualizar uma faixa
--    ou alíquota é incluir uma linha nova com a data de início — a
--    ferramenta escolhe a que vale na data de referência do cálculo, sem
--    mexer em código. Só administradores alteram.
--    Valores conferidos em 10/11/2026 nas fontes oficiais citadas em cada linha.
-- 2. `ferramentas_calculos`: memória pessoal dos últimos cálculos.
-- 3. Bucket privado "arquivos" para chat, tarefas, conhecimento e documentos
--    de empresas, com regra de acesso por pasta.
-- =====================================================================

create table if not exists public.ferramentas_tabelas (
  id              uuid primary key default gen_random_uuid(),
  chave           text not null,
  vigencia_inicio date not null,
  titulo          text not null,
  dados           jsonb not null,
  fonte           text not null,
  fonte_url       text,
  observacao      text,
  conferido_em    date,
  atualizado_por  uuid references public.profiles (id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (chave, vigencia_inicio),
  constraint ferramentas_tabelas_dados check (jsonb_typeof(dados) = 'object')
);

create table if not exists public.ferramentas_calculos (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  ferramenta  text not null,
  titulo      text not null,
  entrada     jsonb not null default '{}'::jsonb,
  resultado   jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists ferramentas_calculos_usuario_idx on public.ferramentas_calculos (usuario_id, ferramenta, created_at desc);

alter table public.ferramentas_tabelas  enable row level security;
alter table public.ferramentas_calculos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'ferramentas_tabelas' and policyname = 'ferramentas_tabelas_select') then
    create policy ferramentas_tabelas_select on public.ferramentas_tabelas for select to authenticated
      using (public.tem_permissao('tela.ferramentas'));
    create policy ferramentas_tabelas_escrita on public.ferramentas_tabelas for all to authenticated
      using (public.is_admin()) with check (public.is_admin());
    create policy ferramentas_calculos_proprios on public.ferramentas_calculos for all to authenticated
      using (usuario_id = (select auth.uid()))
      with check (usuario_id = (select auth.uid()) and public.tem_permissao('tela.ferramentas'));
  end if;
end $$;

create or replace function public.ferramentas_tabela_carimbo()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.atualizado_por := coalesce((select auth.uid()), new.atualizado_por);
  return new;
end;
$$;

revoke all on function public.ferramentas_tabela_carimbo() from public, anon, authenticated;

create or replace trigger trg_ferramentas_tabela_carimbo
  before insert or update on public.ferramentas_tabelas
  for each row execute function public.ferramentas_tabela_carimbo();
create or replace trigger trg_audit_ferramentas_tabelas
  after insert or update or delete on public.ferramentas_tabelas
  for each row execute function public.registrar_auditoria();

insert into public.ferramentas_tabelas (chave, vigencia_inicio, titulo, dados, fonte, fonte_url, observacao, conferido_em) values
('salario_minimo', '2026-01-01', 'Salário mínimo nacional',
 '{"valor": 1621.00}',
 'Decreto nº 12.797/2025', null, null, '2026-11-10'),

('inss_empregado', '2026-01-01', 'INSS — empregado, doméstico e avulso (tabela progressiva)',
 '{"teto": 8475.55, "faixas": [{"ate": 1621.00, "aliquota": 7.5}, {"ate": 2902.84, "aliquota": 9}, {"ate": 4354.27, "aliquota": 12}, {"ate": 8475.55, "aliquota": 14}]}',
 'Portaria Interministerial MPS/MF nº 13, de 9/1/2026',
 'https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal',
 'Alíquotas aplicadas faixa a faixa (EC 103/2019). Vale a partir da competência janeiro/2026.', '2026-11-10'),

('inss_individual', '2026-01-01', 'INSS — contribuinte individual, pró-labore e facultativo',
 '{"minimo": 1621.00, "teto": 8475.55, "aliquota_prolabore": 11, "aliquota_normal": 20, "aliquota_simplificado": 11, "aliquota_mei": 5, "patronal": 20}',
 'Lei nº 8.212/1991, arts. 21, 22 e 30, § 4º; Portaria Interministerial MPS/MF nº 13/2026',
 'https://www.gov.br/inss/pt-br/direitos-e-deveres/inscricao-e-contribuicao/tabela-de-contribuicao-mensal',
 'Pró-labore e autônomo que presta serviço a empresa: 11% retidos, até o teto. Contribuição patronal de 20% não se aplica a empresas do Simples nos Anexos I, II, III e V.', '2026-11-10'),

('irrf_mensal', '2026-01-01', 'IRRF — tabela progressiva mensal e redução da Lei 15.270/2025',
 '{"dependente": 189.59, "desconto_simplificado": 607.20, "faixas": [{"ate": 2428.80, "aliquota": 0, "deducao": 0}, {"ate": 2826.65, "aliquota": 7.5, "deducao": 182.16}, {"ate": 3751.05, "aliquota": 15, "deducao": 394.16}, {"ate": 4664.68, "aliquota": 22.5, "deducao": 675.49}, {"ate": null, "aliquota": 27.5, "deducao": 908.73}], "reducao": {"isento_ate": 5000.00, "limite": 7350.00, "valor_maximo": 312.89, "constante": 978.62, "fator": 0.133145}}',
 'Lei nº 15.191/2025 (tabela) e Lei nº 15.270/2025 (redução) — tabelas 2026 da Receita Federal',
 'https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/2026',
 'Redução: até R$ 5.000,00 de rendimentos tributáveis o imposto é zerado (redução de até R$ 312,89); de R$ 5.000,01 a R$ 7.350,00, redução = 978,62 − 0,133145 × rendimentos tributáveis.', '2026-11-10'),

('fgts', '1990-05-14', 'FGTS — depósito mensal e multa rescisória',
 '{"aliquota": 8, "aliquota_aprendiz": 2, "multa_sem_justa_causa": 40, "multa_acordo": 20}',
 'Lei nº 8.036/1990, arts. 15 e 18; CLT, art. 484-A (rescisão por acordo)', null, null, '2026-11-10'),

('aviso_previo', '2011-10-13', 'Aviso prévio proporcional',
 '{"dias_base": 30, "dias_por_ano": 3, "maximo": 90}',
 'Lei nº 12.506/2011; CLT, art. 487', null,
 '30 dias + 3 dias por ano completo de serviço na mesma empresa, até 90 dias.', '2026-11-10'),

('mei', '2026-01-01', 'MEI — DAS mensal e limite',
 '{"limite_anual": 81000.00, "inss_percentual": 5, "icms": 1.00, "iss": 5.00, "caminhoneiro_percentual": 12, "limite_caminhoneiro": 251600.00}',
 'LC nº 123/2006, arts. 18-A e 18-F; salário mínimo do Decreto nº 12.797/2025', null,
 'INSS = 5% do salário mínimo (12% para o MEI transportador autônomo de cargas), mais R$ 1,00 de ICMS e/ou R$ 5,00 de ISS conforme a atividade.', '2026-11-10'),

('simples_nacional', '2018-01-01', 'Simples Nacional — Anexos I a V',
 '{"limite": 4800000.00, "sublimite": 3600000.00, "fator_r": 28,
   "anexos": {
     "I":   {"nome": "Comércio", "tributos": ["IRPJ", "CSLL", "Cofins", "PIS/Pasep", "CPP", "ICMS"],
             "faixas": [{"ate": 180000, "aliquota": 4.00, "deducao": 0, "reparticao": [5.50, 3.50, 12.74, 2.76, 41.50, 34.00]},
                        {"ate": 360000, "aliquota": 7.30, "deducao": 5940, "reparticao": [5.50, 3.50, 12.74, 2.76, 41.50, 34.00]},
                        {"ate": 720000, "aliquota": 9.50, "deducao": 13860, "reparticao": [5.50, 3.50, 12.74, 2.76, 42.00, 33.50]},
                        {"ate": 1800000, "aliquota": 10.70, "deducao": 22500, "reparticao": [5.50, 3.50, 12.74, 2.76, 42.00, 33.50]},
                        {"ate": 3600000, "aliquota": 14.30, "deducao": 87300, "reparticao": [5.50, 3.50, 12.74, 2.76, 42.00, 33.50]},
                        {"ate": 4800000, "aliquota": 19.00, "deducao": 378000, "reparticao": [13.50, 10.00, 28.27, 6.13, 42.10, 0]}]},
     "II":  {"nome": "Indústria", "tributos": ["IRPJ", "CSLL", "Cofins", "PIS/Pasep", "CPP", "IPI", "ICMS"],
             "faixas": [{"ate": 180000, "aliquota": 4.50, "deducao": 0, "reparticao": [5.50, 3.50, 11.51, 2.49, 37.50, 7.50, 32.00]},
                        {"ate": 360000, "aliquota": 7.80, "deducao": 5940, "reparticao": [5.50, 3.50, 11.51, 2.49, 37.50, 7.50, 32.00]},
                        {"ate": 720000, "aliquota": 10.00, "deducao": 13860, "reparticao": [5.50, 3.50, 11.51, 2.49, 37.50, 7.50, 32.00]},
                        {"ate": 1800000, "aliquota": 11.20, "deducao": 22500, "reparticao": [5.50, 3.50, 11.51, 2.49, 37.50, 7.50, 32.00]},
                        {"ate": 3600000, "aliquota": 14.70, "deducao": 85500, "reparticao": [5.50, 3.50, 11.51, 2.49, 37.50, 7.50, 32.00]},
                        {"ate": 4800000, "aliquota": 30.00, "deducao": 720000, "reparticao": [8.50, 7.50, 20.96, 4.54, 23.50, 35.00, 0]}]},
     "III": {"nome": "Serviços (Anexo III)", "tributos": ["IRPJ", "CSLL", "Cofins", "PIS/Pasep", "CPP", "ISS"],
             "faixas": [{"ate": 180000, "aliquota": 6.00, "deducao": 0, "reparticao": [4.00, 3.50, 12.82, 2.78, 43.40, 33.50]},
                        {"ate": 360000, "aliquota": 11.20, "deducao": 9360, "reparticao": [4.00, 3.50, 14.05, 3.05, 43.40, 32.00]},
                        {"ate": 720000, "aliquota": 13.50, "deducao": 17640, "reparticao": [4.00, 3.50, 13.64, 2.96, 43.40, 32.50]},
                        {"ate": 1800000, "aliquota": 16.00, "deducao": 35640, "reparticao": [4.00, 3.50, 13.64, 2.96, 43.40, 32.50]},
                        {"ate": 3600000, "aliquota": 21.00, "deducao": 125640, "reparticao": [4.00, 3.50, 12.82, 2.78, 43.40, 33.50]},
                        {"ate": 4800000, "aliquota": 33.00, "deducao": 648000, "reparticao": [35.00, 15.00, 16.03, 3.47, 30.50, 0]}]},
     "IV":  {"nome": "Serviços (Anexo IV — CPP fora do DAS)", "tributos": ["IRPJ", "CSLL", "Cofins", "PIS/Pasep", "ISS"],
             "faixas": [{"ate": 180000, "aliquota": 4.50, "deducao": 0, "reparticao": [18.80, 15.20, 17.67, 3.83, 44.50]},
                        {"ate": 360000, "aliquota": 9.00, "deducao": 8100, "reparticao": [19.80, 15.20, 20.55, 4.45, 40.00]},
                        {"ate": 720000, "aliquota": 10.20, "deducao": 12420, "reparticao": [20.80, 15.20, 19.73, 4.27, 40.00]},
                        {"ate": 1800000, "aliquota": 14.00, "deducao": 39780, "reparticao": [17.80, 19.20, 18.90, 4.10, 40.00]},
                        {"ate": 3600000, "aliquota": 22.00, "deducao": 183780, "reparticao": [18.80, 19.20, 18.08, 3.92, 40.00]},
                        {"ate": 4800000, "aliquota": 33.00, "deducao": 828000, "reparticao": [53.50, 21.50, 20.55, 4.45, 0]}]},
     "V":   {"nome": "Serviços (Anexo V — sujeito ao Fator R)", "tributos": ["IRPJ", "CSLL", "Cofins", "PIS/Pasep", "CPP", "ISS"],
             "faixas": [{"ate": 180000, "aliquota": 15.50, "deducao": 0, "reparticao": [25.00, 15.00, 14.10, 3.05, 28.85, 14.00]},
                        {"ate": 360000, "aliquota": 18.00, "deducao": 4500, "reparticao": [23.00, 15.00, 14.10, 3.05, 27.85, 17.00]},
                        {"ate": 720000, "aliquota": 19.50, "deducao": 9900, "reparticao": [24.00, 15.00, 14.92, 3.23, 23.85, 19.00]},
                        {"ate": 1800000, "aliquota": 20.50, "deducao": 17100, "reparticao": [21.00, 15.00, 15.74, 3.41, 23.85, 21.00]},
                        {"ate": 3600000, "aliquota": 23.00, "deducao": 62100, "reparticao": [23.00, 12.50, 14.10, 3.05, 23.85, 23.50]},
                        {"ate": 4800000, "aliquota": 30.50, "deducao": 540000, "reparticao": [35.00, 15.50, 16.44, 3.56, 29.50, 0]}]}
   }}',
 'LC nº 123/2006, Anexos I a V (redação da LC nº 155/2016), art. 18 e § 5º-J (Fator R)',
 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm',
 'Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12. Acima de R$ 3,6 milhões (sublimite), ICMS e ISS são recolhidos fora do DAS. Na 5ª faixa dos Anexos III, IV e V o ISS efetivo é limitado a 5%, com a diferença transferida aos tributos federais.', '2026-11-10'),

('lucro_presumido', '2026-01-01', 'Lucro Presumido — presunção e alíquotas',
 '{"irpj": 15, "adicional_irpj": 10, "limite_adicional_mensal": 20000.00, "csll": 9, "pis": 0.65, "cofins": 3,
   "presuncao": {
     "comercio":  {"nome": "Comércio e indústria", "irpj": 8, "csll": 12},
     "servicos":  {"nome": "Serviços em geral", "irpj": 32, "csll": 32},
     "hospitalares": {"nome": "Serviços hospitalares (sociedade empresária)", "irpj": 8, "csll": 12},
     "transporte_cargas": {"nome": "Transporte de cargas", "irpj": 8, "csll": 12},
     "transporte_passageiros": {"nome": "Transporte de passageiros", "irpj": 16, "csll": 12},
     "combustiveis": {"nome": "Revenda de combustíveis", "irpj": 1.6, "csll": 12}
   },
   "acrescimo_lc224": {"percentual": 10, "limite_anual": 5000000.00, "irpj_desde": "2026-01-01", "csll_desde": "2026-04-01"}}',
 'Lei nº 9.249/1995, arts. 15 e 20; Lei nº 9.430/1996; Lei nº 9.718/1998; LC nº 224/2025', null,
 'LC 224/2025: os percentuais de presunção sobem 10% sobre a parcela da receita bruta anual que passar de R$ 5 milhões (IRPJ desde 1º/1/2026; CSLL após a noventena, a partir do 2º trimestre de 2026). Confirme a regulamentação da Receita antes de usar em planejamento. PIS/Cofins no regime cumulativo.', '2026-11-10'),

('lucro_real', '2003-02-01', 'Lucro Real — alíquotas',
 '{"irpj": 15, "adicional_irpj": 10, "limite_adicional_mensal": 20000.00, "csll": 9, "pis": 1.65, "cofins": 7.6}',
 'Lei nº 9.249/1995; Lei nº 10.637/2002 (PIS) e Lei nº 10.833/2003 (Cofins) — regime não cumulativo', null,
 'PIS/Cofins não cumulativos: o valor devido depende dos créditos. CSLL de 9% para a regra geral (instituições financeiras e seguradoras têm alíquotas maiores).', '2026-11-10'),

('acrescimos_federais', '1997-01-01', 'Tributos federais em atraso — multa e juros de mora',
 '{"multa_dia": 0.33, "multa_teto": 20, "juros_mes_pagamento": 1}',
 'Lei nº 9.430/1996, art. 61', 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/pagamentos-e-parcelamentos/taxa-de-juros-selic',
 'Multa de mora de 0,33% por dia de atraso, limitada a 20%. Juros: Selic acumulada do mês seguinte ao vencimento até o mês anterior ao pagamento, mais 1% no mês do pagamento.', '2026-11-10')
on conflict (chave, vigencia_inicio) do nothing;

-- ---------------------------------------------------------------------
-- Arquivos: bucket privado com acesso por pasta
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arquivos', 'arquivos', false, 26214400, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/zip', 'application/x-zip-compressed', 'application/xml', 'text/xml',
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

/**
 * Quem pode ler ou gravar um arquivo, pela pasta:
 *   chat/<conversa>/…          participantes da conversa
 *   tarefas/<tarefa>/…         quem vê a tarefa
 *   conhecimento/<artigo>/…    quem vê a Central (grava: quem escreve nela)
 *   empresas/<empresa>/…       quem lê a Legalização (grava: quem edita)
 */
create or replace function public.arquivo_acesso(p_nome text, p_gravar boolean)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_partes text[] := string_to_array(p_nome, '/');
  v_id uuid;
begin
  if not public.is_active() or coalesce(array_length(v_partes, 1), 0) < 3 then
    return false;
  end if;
  begin
    v_id := v_partes[2]::uuid;
  exception when others then
    return false;
  end;
  return case v_partes[1]
    when 'chat' then public.chat_participa(v_id) and (not p_gravar or public.tem_permissao('tela.chat'))
    when 'tarefas' then public.tarefa_pode_ver(v_id)
    when 'conhecimento' then case when p_gravar then public.tem_permissao('dados.conhecimento.editar')
                                  else public.tem_permissao('tela.conhecimento') end
    when 'empresas' then case when p_gravar then public.can_write_legalizacao() else public.can_read_legalizacao() end
    else false
  end;
end;
$$;

revoke all on function public.arquivo_acesso(text, boolean) from public, anon;
grant execute on function public.arquivo_acesso(text, boolean) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'arquivos_ler') then
    create policy arquivos_ler on storage.objects for select to authenticated
      using (bucket_id = 'arquivos' and public.arquivo_acesso(name, false));
    create policy arquivos_gravar on storage.objects for insert to authenticated
      with check (bucket_id = 'arquivos' and public.arquivo_acesso(name, true));
    create policy arquivos_apagar on storage.objects for delete to authenticated
      using (bucket_id = 'arquivos' and (owner_id = (select auth.uid())::text or public.is_admin()));
  end if;
end $$;
