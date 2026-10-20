'use client';

import { useMemo, useState, type FormEvent } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Handshake, Plus, Search, X } from 'lucide-react';

import { SituacaoDepartamentos, situacaoDoRoteiro } from '@/components/integracao/SituacaoDepartamentos';
import { BuscaEmpresa } from '@/components/processos/BuscaEmpresa';
import { Botao, Campo, Cartao, EstadoVazio, Modal, cn } from '@/components/ui';
import { br, hojeYmd } from '@/lib/calendario';
import { INTEG_DEPTS } from '@/lib/integracao';
import { mascararCnpj } from '@/lib/mascaras';
import { formatarCnpj } from '@/lib/normalizacao';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { Integracao, ResumoIntegracao } from '@/types/banco';

export interface PreenchimentoNovaIntegracao {
  empresa: string;
  empresaId?: string | null;
  cnpj?: string;
  dataReuniao?: string;
  modalidade?: string;
  canal?: string;
  eventoId?: string;
}

type Recorte = 'todas' | 'andamento' | 'finalizadas';

export function ListaIntegracoes({
  meuNome,
  integracoes,
  resumo,
  preenchimento,
  empresaFiltro,
}: {
  meuNome: string;
  integracoes: Integracao[];
  resumo: ResumoIntegracao[];
  preenchimento: PreenchimentoNovaIntegracao | null;
  empresaFiltro: { id: string; nome: string } | null;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState('');
  const [recorte, setRecorte] = useState<Recorte>('todas');
  const [nova, setNova] = useState<PreenchimentoNovaIntegracao | null>(preenchimento);

  /** Todos os roteiros finalizados = integração concluída. */
  const concluida = (i: Integracao) => INTEG_DEPTS.every((d) => situacaoDoRoteiro(resumo, i.id, d).s === 'ok');

  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const bn = b.replace(/\D/g, '');
    return integracoes
      .filter((i) => !empresaFiltro || i.empresa_id === empresaFiltro.id)
      .filter((i) => {
        const f = i.ficha ?? {};
        return !b || String(f.empresa ?? '').toLowerCase().includes(b) || (bn && String(f.cnpj ?? '').replace(/\D/g, '').includes(bn));
      })
      .filter((i) => recorte === 'todas' || (recorte === 'finalizadas' ? concluida(i) : !concluida(i)))
      .sort((a, c) => String(c.ficha?.dataReuniao || c.created_at).localeCompare(String(a.ficha?.dataReuniao || a.created_at)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integracoes, busca, recorte, empresaFiltro, resumo]);

  const totais = {
    todas: integracoes.length,
    andamento: integracoes.filter((i) => !concluida(i)).length,
    finalizadas: integracoes.filter(concluida).length,
  };

  return (
    <div className="space-y-4">
      <Cartao className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-fraco" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por empresa ou CNPJ"
              className="h-10 w-full rounded-lg border border-borda-forte bg-white pl-9.5 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg bg-superficie p-1">
              {(
                [
                  ['todas', 'Todas'],
                  ['andamento', 'Em andamento'],
                  ['finalizadas', 'Concluídas'],
                ] as const
              ).map(([v, r]) => (
                <button
                  key={v}
                  onClick={() => setRecorte(v)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    recorte === v ? 'bg-white text-marca-800 shadow-sm' : 'text-texto-suave hover:text-texto',
                  )}
                >
                  {r} <span className="tabular-nums text-texto-fraco">{totais[v]}</span>
                </button>
              ))}
            </div>
            <Botao onClick={() => setNova({ empresa: empresaFiltro?.nome ?? '', empresaId: empresaFiltro?.id ?? null })}>
              <Plus className="h-4 w-4" /> Nova integração
            </Botao>
          </div>
        </div>
        {empresaFiltro && (
          <p className="mt-3 flex items-center gap-2 text-sm text-texto-suave">
            Mostrando só <strong className="text-texto">{empresaFiltro.nome}</strong>
            <Link href="/integracao-clientes" className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline">
              <X className="h-3 w-3" /> ver todas
            </Link>
          </p>
        )}
      </Cartao>

      {lista.length === 0 ? (
        <Cartao>
          <EstadoVazio
            icone={<Handshake className="h-6 w-6" />}
            titulo={busca || empresaFiltro || recorte !== 'todas' ? 'Nenhuma integração encontrada' : 'Nenhuma integração ainda'}
            descricao={
              busca || empresaFiltro || recorte !== 'todas'
                ? 'Ajuste a busca ou o recorte.'
                : 'Clique em "Nova integração" ou abra uma Reunião de Integração no Calendário de Obrigações.'
            }
          />
        </Cartao>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {lista.map((i) => {
            const f = i.ficha ?? {};
            return (
              <li key={i.id}>
                <Link
                  href={`/integracao-clientes/${i.id}`}
                  className="block rounded-xl border border-borda bg-superficie-elevada p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-marca-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-texto">{f.empresa || 'Sem nome'}</p>
                      <p className="mt-0.5 text-xs text-texto-suave">
                        {[f.cnpj ? `CNPJ ${formatarCnpj(f.cnpj)}` : '', f.dataReuniao ? `Reunião em ${br(f.dataReuniao)}` : '', f.modalidade || '', f.regime || '']
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    {i.evento_id && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-marca-50 px-2 py-0.5 text-[11px] font-medium text-marca-800" title="Ligada a uma reunião do calendário">
                        <CalendarDays className="h-3 w-3" /> Calendário
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <SituacaoDepartamentos resumo={resumo} integracaoId={i.id} />
                  </div>
                  <p className="mt-2 text-[11px] text-texto-fraco">
                    Aberta {i.criado_por_nome ? `por ${i.criado_por_nome} ` : ''}em {new Date(i.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <NovaIntegracao
        pre={nova}
        aoFechar={() => {
          setNova(null);
          if (preenchimento) router.replace('/integracao-clientes');
        }}
        meuNome={meuNome}
      />
    </div>
  );
}

function NovaIntegracao({ pre, aoFechar, meuNome }: { pre: PreenchimentoNovaIntegracao | null; aoFechar: () => void; meuNome: string }) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const router = useRouter();
  const [empresa, setEmpresa] = useState('');
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [cnpj, setCnpj] = useState('');
  const [data, setData] = useState(hojeYmd());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aberto, setAberto] = useState<PreenchimentoNovaIntegracao | null>(null);

  // Reinicia o formulário a cada abertura.
  if (pre !== aberto) {
    setAberto(pre);
    if (pre) {
      setEmpresa(pre.empresa ?? '');
      setEmpresaId(pre.empresaId ?? null);
      setCnpj(pre.cnpj ? formatarCnpj(pre.cnpj) : '');
      setData(pre.dataReuniao || hojeYmd());
      setErro('');
    }
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!pre) return;
    if (!empresa.trim()) {
      setErro('Preencha o nome do cliente.');
      return;
    }
    const ficha: Record<string, string> = {
      empresa: empresa.trim(),
      cnpj: cnpj.trim(),
      dataReuniao: data,
      ...(pre.modalidade ? { modalidade: pre.modalidade } : {}),
      ...(pre.canal ? { canal: pre.canal } : {}),
    };
    setSalvando(true);
    const { data: criada, error } = await supabase
      .from('integracoes')
      .insert({ ficha, empresa_id: empresaId, evento_id: pre.eventoId ?? null, criado_por_nome: meuNome })
      .select('id')
      .single();
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    router.push(`/integracao-clientes/${(criada as { id: string }).id}`);
  }

  return (
    <Modal
      aberto={Boolean(pre)}
      aoFechar={aoFechar}
      titulo="Nova integração de cliente"
      descricao={pre?.eventoId ? 'Preenchida com os dados da Reunião de Integração do calendário.' : undefined}
      largura="md"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao type="submit" form="form-nova-integracao" carregando={salvando}>
            Criar e abrir
          </Botao>
        </>
      }
    >
      <form id="form-nova-integracao" onSubmit={criar} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <BuscaEmpresa
            rotulo="Cliente (razão social)"
            valor={empresa}
            autoFocus
            aoEscolher={(emp) => {
              setEmpresa(emp.razao_social);
              setEmpresaId(emp.id);
              if (emp.cnpj) setCnpj(formatarCnpj(emp.cnpj));
            }}
            aoDigitarLivre={(t) => {
              setEmpresa(t);
              setEmpresaId(null);
            }}
            dica="Cliente novo ainda fora da base também vale: o vínculo é feito pelo CNPJ quando ele entrar na planilha."
          />
        </div>
        <Campo rotulo="CNPJ" inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(mascararCnpj(e.target.value))} />
        <Campo rotulo="Data da reunião" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        {erro && <p className="rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro sm:col-span-2">{erro}</p>}
      </form>
    </Modal>
  );
}
