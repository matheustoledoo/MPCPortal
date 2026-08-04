/**
 * Edge Function `importar-legalizacao`
 * ====================================
 *
 * Recebe o conjunto já consolidado por `scripts/import-planilhas.ts` e grava
 * no banco usando a `service_role` — que permanece dentro do Supabase e nunca
 * transita pelo navegador nem pelo ambiente de quem roda o ETL.
 *
 * Autenticação em duas camadas:
 *   1. JWT do gateway (verify_jwt);
 *   2. header `x-import-token` conferido contra o segredo IMPORT_TOKEN.
 *
 * Sem IMPORT_TOKEN configurado a função recusa qualquer requisição, para não
 * existir endpoint de escrita aberto por descuido.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const LOTE = 100;

interface Corpo {
  relatorio: Record<string, unknown>;
  empresas: Record<string, unknown>[];
  administrativos: Record<string, unknown>[];
  divergencias: Record<string, unknown>[];
}

function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido' }, 405);

  const esperado = Deno.env.get('IMPORT_TOKEN');
  if (!esperado) return json({ erro: 'IMPORT_TOKEN não configurado no projeto.' }, 503);
  if (req.headers.get('x-import-token') !== esperado) return json({ erro: 'Token inválido.' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'JSON inválido.' }, 400);
  }

  const { data: log, error: erroLog } = await supabase
    .from('import_logs')
    .insert({
      status: 'em_andamento',
      executado_por_desc: 'edge function importar-legalizacao',
      arquivos: (corpo.relatorio?.arquivos as unknown) ?? [],
      resumo: corpo.relatorio ?? {},
    })
    .select('id')
    .single();

  if (erroLog) return json({ erro: `import_logs: ${erroLog.message}` }, 500);
  const importLogId = log.id as string;

  try {
    const idsPorChave = new Map<string, string>();

    for (let i = 0; i < corpo.empresas.length; i += LOTE) {
      const { data, error } = await supabase
        .from('legalizacao_empresas')
        .upsert(corpo.empresas.slice(i, i + LOTE), { onConflict: 'chave_identificacao' })
        .select('id, chave_identificacao');
      if (error) throw new Error(`legalizacao_empresas: ${error.message}`);
      data?.forEach((l) => idsPorChave.set(l.chave_identificacao as string, l.id as string));
    }

    const administrativos = corpo.administrativos
      .map(({ chave_identificacao, ...resto }) => ({
        empresa_id: idsPorChave.get(chave_identificacao as string),
        ...resto,
      }))
      .filter((linha) => linha.empresa_id);

    for (let i = 0; i < administrativos.length; i += LOTE) {
      const { error } = await supabase
        .from('legalizacao_dados_administrativos')
        .upsert(administrativos.slice(i, i + LOTE), { onConflict: 'empresa_id' });
      if (error) throw new Error(`legalizacao_dados_administrativos: ${error.message}`);
    }

    if (corpo.divergencias.length > 0) {
      const divergencias = corpo.divergencias.map((d) => ({
        ...d,
        import_log_id: importLogId,
        empresa_id: idsPorChave.get(d.chave as string) ?? null,
      }));
      for (let i = 0; i < divergencias.length; i += LOTE) {
        const { error } = await supabase.from('import_divergencias').insert(divergencias.slice(i, i + LOTE));
        if (error) throw new Error(`import_divergencias: ${error.message}`);
      }
    }

    await supabase
      .from('import_logs')
      .update({ status: 'concluido', finalizado_em: new Date().toISOString() })
      .eq('id', importLogId);

    await supabase.rpc('registrar_evento_auditoria', {
      p_acao: 'IMPORT',
      p_tabela: 'legalizacao_empresas',
      p_registro_id: importLogId,
      p_contexto: { origem: 'edge-function', arquivos: ['Planilha_Saude.xlsx', 'Adm.xlsx'] },
      p_dados_novos: corpo.relatorio ?? {},
    });

    return json({
      ok: true,
      import_log_id: importLogId,
      empresas: corpo.empresas.length,
      administrativos: administrativos.length,
      divergencias: corpo.divergencias.length,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await supabase
      .from('import_logs')
      .update({ status: 'erro', finalizado_em: new Date().toISOString(), mensagem_erro: mensagem })
      .eq('id', importLogId);
    return json({ erro: mensagem, import_log_id: importLogId }, 500);
  }
});
