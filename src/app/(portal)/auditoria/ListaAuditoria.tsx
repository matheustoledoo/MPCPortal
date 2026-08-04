'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';

import {
  Botao,
  Cartao,
  Campo,
  EsqueletoLinhas,
  EstadoErro,
  EstadoVazio,
  Selecao,
  Selo,
  cn,
} from '@/components/ui';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { AcaoAuditoria, RegistroAuditoria } from '@/types/banco';

const ACOES: { valor: AcaoAuditoria | ''; rotulo: string }[] = [
  { valor: '', rotulo: 'Todas as ações' },
  { valor: 'INSERT', rotulo: 'Criação' },
  { valor: 'UPDATE', rotulo: 'Edição' },
  { valor: 'DELETE', rotulo: 'Exclusão' },
  { valor: 'IMPORT', rotulo: 'Importação' },
  { valor: 'EXPORT', rotulo: 'Exportação' },
  { valor: 'ADMIN_UPDATE', rotulo: 'Alteração de dados administrativos' },
];

const TONS: Record<string, 'sucesso' | 'info' | 'erro' | 'alerta' | 'marca' | 'neutro'> = {
  INSERT: 'sucesso',
  UPDATE: 'info',
  DELETE: 'erro',
  IMPORT: 'marca',
  EXPORT: 'marca',
  ADMIN_UPDATE: 'alerta',
  ADMIN_READ: 'alerta',
  LOGIN: 'neutro',
};

const POR_PAGINA = 40;

export function ListaAuditoria() {
  const supabase = useMemo(() => criarClienteNavegador(), []);

  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [acao, setAcao] = useState<AcaoAuditoria | ''>('');
  const [tabela, setTabela] = useState('');
  const [usuario, setUsuario] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (acao) query = query.eq('acao', acao);
      if (tabela) query = query.eq('tabela', tabela);
      if (usuario.trim()) query = query.ilike('usuario_email', `%${usuario.trim()}%`);

      const de = (pagina - 1) * POR_PAGINA;
      const { data, error, count } = await query.range(de, de + POR_PAGINA - 1);
      if (error) throw new Error(error.message);

      setRegistros((data ?? []) as RegistroAuditoria[]);
      setTotal(count ?? 0);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar a auditoria.');
    } finally {
      setCarregando(false);
    }
  }, [supabase, acao, tabela, usuario, pagina]);

  useEffect(() => {
    const timer = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(timer);
  }, [carregar]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="space-y-4">
      <Cartao className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Selecao
            rotulo="Ação"
            value={acao}
            onChange={(e) => {
              setAcao(e.target.value as AcaoAuditoria | '');
              setPagina(1);
            }}
          >
            {ACOES.map((item) => (
              <option key={item.valor} value={item.valor}>
                {item.rotulo}
              </option>
            ))}
          </Selecao>

          <Selecao
            rotulo="Tabela"
            value={tabela}
            onChange={(e) => {
              setTabela(e.target.value);
              setPagina(1);
            }}
          >
            <option value="">Todas</option>
            <option value="legalizacao_empresas">legalizacao_empresas</option>
            <option value="legalizacao_dados_administrativos">legalizacao_dados_administrativos</option>
            <option value="profiles">profiles</option>
          </Selecao>

          <Campo
            rotulo="Usuário (e-mail)"
            type="search"
            placeholder="filtrar por e-mail…"
            value={usuario}
            onChange={(e) => {
              setUsuario(e.target.value);
              setPagina(1);
            }}
          />
        </div>
      </Cartao>

      <Cartao>
        {carregando && registros.length === 0 ? (
          <EsqueletoLinhas linhas={10} />
        ) : erro ? (
          <EstadoErro mensagem={erro} aoTentarNovamente={() => void carregar()} />
        ) : registros.length === 0 ? (
          <EstadoVazio
            icone={<ScrollText className="h-6 w-6" />}
            titulo="Nenhum registro encontrado"
            descricao="Ajuste os filtros para ver outros eventos."
          />
        ) : (
          <ul className="divide-y divide-borda">
            {registros.map((registro) => {
              const aberto = expandido === registro.id;
              return (
                <li key={registro.id}>
                  <button
                    onClick={() => setExpandido(aberto ? null : registro.id)}
                    className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-superficie"
                  >
                    {aberto ? (
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-texto-fraco" />
                    ) : (
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-texto-fraco" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Selo tom={TONS[registro.acao] ?? 'neutro'}>{registro.acao}</Selo>
                        <code className="rounded bg-superficie px-1.5 py-0.5 font-mono text-xs text-texto-suave">
                          {registro.tabela}
                        </code>
                        {registro.campos_alterados && registro.campos_alterados.length > 0 && (
                          <span className="text-xs text-texto-suave">
                            {registro.campos_alterados.length} campo(s):{' '}
                            {registro.campos_alterados.slice(0, 4).join(', ')}
                            {registro.campos_alterados.length > 4 && '…'}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-texto-suave">
                        {registro.usuario_nome ?? registro.usuario_email ?? 'sistema / importação'} ·{' '}
                        {new Date(registro.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </button>

                  {aberto && (
                    <div className="animar-surgir grid gap-3 border-t border-borda bg-superficie px-5 py-4 lg:grid-cols-2">
                      <BlocoJson titulo="Antes" dados={registro.dados_anteriores} tom="erro" />
                      <BlocoJson titulo="Depois" dados={registro.dados_novos} tom="sucesso" />
                      {registro.contexto && (
                        <div className="lg:col-span-2">
                          <BlocoJson titulo="Contexto" dados={registro.contexto} tom="neutro" />
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>

      <div className="flex items-center justify-between text-sm">
        <span className="tabular-nums text-texto-suave">
          {total.toLocaleString('pt-BR')} evento(s) · página {pagina} de {totalPaginas}
        </span>
        <div className="flex gap-2">
          <Botao
            variante="secundario"
            tamanho="sm"
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
          >
            Anterior
          </Botao>
          <Botao
            variante="secundario"
            tamanho="sm"
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={pagina >= totalPaginas}
          >
            Próxima
          </Botao>
        </div>
      </div>
    </div>
  );
}

function BlocoJson({
  titulo,
  dados,
  tom,
}: {
  titulo: string;
  dados: Record<string, unknown> | null;
  tom: 'erro' | 'sucesso' | 'neutro';
}) {
  if (!dados) {
    return (
      <div>
        <p className="mb-1 text-xs font-semibold text-texto-suave">{titulo}</p>
        <p className="text-xs text-texto-fraco">—</p>
      </div>
    );
  }

  const cores = {
    erro: 'border-red-200 bg-erro-suave/40',
    sucesso: 'border-green-200 bg-sucesso-suave/40',
    neutro: 'border-borda bg-superficie-elevada',
  };

  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-texto-suave">{titulo}</p>
      <pre
        className={cn(
          'max-h-56 overflow-auto rounded-lg border p-2.5 font-mono text-[11px] leading-relaxed text-texto',
          cores[tom],
        )}
      >
        {JSON.stringify(dados, null, 2)}
      </pre>
    </div>
  );
}
