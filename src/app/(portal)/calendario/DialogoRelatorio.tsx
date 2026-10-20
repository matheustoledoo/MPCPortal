'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { FileSpreadsheet, FileText } from 'lucide-react';

import { Botao, Campo, Modal, Selecao, cn } from '@/components/ui';
import { MESES, br, criarCalendarioFeriados, hojeYmd, ocorrencias } from '@/lib/calendario';
import { abrirParaImprimir, agoraBr, esc, nomeDeArquivo } from '@/lib/impressao';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { ConclusaoCalendario, Departamento, EventoCalendario, RegraCalendario } from '@/types/banco';

type Formato = 'pdf' | 'xlsx';
type Situacao = '' | 'ok' | 'pend';

interface LinhaRelatorio {
  prazo: string;
  inicio: string;
  titulo: string;
  ref: string;
  tipo: string;
  departamento: string;
  responsavel: string;
  situacao: 'Concluído' | 'Atrasado' | 'Pendente';
  quando: string;
  por: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const COR_SITUACAO = { Concluído: '#15803d', Atrasado: '#b91c1c', Pendente: '#64748b' };
const nomeMes = (v: string) => {
  const [a, b] = v.split('-');
  return `${MESES[Number(b) - 1]}/${a}`;
};

/**
 * "Gerar relatório" do app antigo: período em meses, departamento, situação,
 * em PDF (para imprimir e guardar) ou Excel. As datas saem da mesma conta
 * do calendário e as conclusões vêm do banco, sob a RLS de quem pede.
 */
export function DialogoRelatorio({
  aberto,
  aoFechar,
  mesAtual,
  deptosPermitidos,
  todos,
  deptSel,
  regras,
  eventos,
  nomeDe,
  meuNome,
}: {
  aberto: boolean;
  aoFechar: () => void;
  mesAtual: string;
  deptosPermitidos: Departamento[];
  todos: boolean;
  deptSel: Departamento | null;
  regras: RegraCalendario[];
  eventos: EventoCalendario[];
  nomeDe: (id: string | null) => string | null;
  meuNome: string;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const [de, setDe] = useState(mesAtual);
  const [ate, setAte] = useState(mesAtual);
  const [dept, setDept] = useState<string>(deptSel ?? (todos ? '' : deptosPermitidos[0]));
  const [formato, setFormato] = useState<Formato>('pdf');
  const [situacao, setSituacao] = useState<Situacao>('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setDe(mesAtual);
    setAte(mesAtual);
    setDept(deptSel ?? (todos ? '' : deptosPermitidos[0]));
    setErro('');
    setPronto('');
  }, [aberto, mesAtual, deptSel, todos, deptosPermitidos]);

  async function montarLinhas(): Promise<LinhaRelatorio[]> {
    const meses: { y: number; m: number }[] = [];
    let [y, m] = de.split('-').map(Number);
    const [y2, m2] = ate.split('-').map(Number);
    while ((y < y2 || (y === y2 && m <= m2)) && meses.length < 36) {
      meses.push({ y, m });
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }

    const chavesMes = meses.map((x) => `${x.y}-${pad(x.m)}`);
    const feitas = new Map<string, ConclusaoCalendario>();
    for (let i = 0; i < chavesMes.length; i += 12) {
      const { data, error } = await supabase.from('calendario_conclusoes').select('*').in('mes', chavesMes.slice(i, i + 12));
      if (error) throw new Error(error.message);
      for (const c of (data ?? []) as ConclusaoCalendario[]) feitas.set(c.chave, c);
    }

    const feriados = criarCalendarioFeriados(eventos);
    const hoje = hojeYmd();
    const linhas: LinhaRelatorio[] = [];
    for (const { y: ano, m: mes } of meses) {
      for (const o of ocorrencias(ano, mes, regras, eventos, feriados, nomeDe)) {
        if (o.inicio) continue;
        if (dept && o.departamento !== dept && !o.visivel.includes(dept as Departamento)) continue;
        const c = feitas.get(o.chave);
        const prazo = o.prazo || o.data;
        if (situacao === 'ok' && !c) continue;
        if (situacao === 'pend' && c) continue;
        linhas.push({
          prazo: br(prazo),
          inicio: o.inicioData ? br(o.inicioData) : '',
          titulo: o.titulo.replace(/^[⏳▶]\s*/u, ''),
          ref: o.ref,
          tipo: o.fonte === 'regra' ? 'Obrigação fixa' : o.tipo || 'Compromisso',
          departamento: o.departamento,
          responsavel: o.responsavel,
          situacao: c ? 'Concluído' : prazo < hoje ? 'Atrasado' : 'Pendente',
          quando: c ? new Date(c.concluido_em).toLocaleDateString('pt-BR') : '',
          por: c ? (nomeDe(c.concluido_por) ?? c.concluido_por_nome ?? '') : '',
        });
      }
    }
    return linhas;
  }

  async function gerar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setPronto('');
    if (!de || !ate || de > ate) {
      setErro('Confira o período: o mês inicial precisa ser antes do final.');
      return;
    }
    // A aba do PDF abre já no clique, senão o navegador bloqueia.
    const janela = formato === 'pdf' ? window.open('', '_blank') : null;
    setGerando(true);
    try {
      const linhas = await montarLinhas();
      const periodo = de === ate ? nomeMes(de) : `${nomeMes(de)} a ${nomeMes(ate)}`;
      const rotuloDept = dept || 'Todos os departamentos';
      const rotuloSit = situacao === 'ok' ? 'Só concluídas' : situacao === 'pend' ? 'Só pendentes e atrasadas' : 'Todas';
      const arquivo = nomeDeArquivo(`Relatório ${dept || 'Todos'} ${de}${de === ate ? '' : `_a_${ate}`}`);

      if (formato === 'xlsx') {
        const XLSX = await import('xlsx');
        const cab = ['Prazo', 'Prazo inicial', 'Obrigação / demanda', 'Competência', 'Tipo', 'Departamento', 'Designado para', 'Situação', 'Concluído em', 'Por'];
        const topo = [
          ['PortalMPC — Calendário de Obrigações'],
          [`Período: ${periodo} · Departamento: ${rotuloDept} · Situação: ${rotuloSit}`],
          [`Gerado por ${meuNome} em ${agoraBr()}`],
          [],
        ];
        const dados = linhas.map((l) => [l.prazo, l.inicio, l.titulo, l.ref, l.tipo, l.departamento, l.responsavel, l.situacao, l.quando, l.por]);
        const ws = XLSX.utils.aoa_to_sheet([...topo, cab, ...dados]);
        ws['!cols'] = [12, 12, 46, 18, 18, 22, 22, 12, 13, 22].map((wch) => ({ wch }));
        ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 4, c: 0 }, e: { r: 4 + dados.length, c: cab.length - 1 } }) };
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
        XLSX.writeFile(wb, `${arquivo}.xlsx`);
        setPronto(`Planilha com ${linhas.length} itens baixada (${arquivo}.xlsx).`);
      } else {
        const conta = (s: LinhaRelatorio['situacao']) => linhas.filter((l) => l.situacao === s).length;
        const corpo = `
          <div class="marca">PORTALMPC · META PLANO CONTÁBIL</div>
          <h1>Calendário de Obrigações — Relatório</h1>
          <div class="sub">Período: <b>${esc(periodo)}</b> · Departamento: <b>${esc(rotuloDept)}</b> · Situação: ${esc(rotuloSit)}
            <br>Gerado por ${esc(meuNome)} em ${esc(agoraBr())}</div>
          <div class="tot"><span>Total: <b>${linhas.length}</b></span><span>Concluídos: <b>${conta('Concluído')}</b></span>
            <span>Pendentes: <b>${conta('Pendente')}</b></span><span>Atrasados: <b>${conta('Atrasado')}</b></span></div>
          <table><thead><tr><th>Prazo</th><th>Obrigação / demanda</th><th>Tipo</th><th>Departamento</th><th>Designado para</th>
            <th>Situação</th><th>Concluído em</th><th>Por</th></tr></thead><tbody>
          ${
            linhas
              .map(
                (l) => `<tr><td>${esc(l.prazo)}${l.inicio ? `<br><span class="fraco">início ${esc(l.inicio)}</span>` : ''}</td>
                <td>${esc(l.titulo)}${l.ref ? `<br><span class="fraco">${esc(l.ref)}</span>` : ''}</td><td>${esc(l.tipo)}</td>
                <td>${esc(l.departamento)}</td><td>${esc(l.responsavel)}</td>
                <td style="color:${COR_SITUACAO[l.situacao]};font-weight:700">${l.situacao}</td><td>${esc(l.quando)}</td><td>${esc(l.por)}</td></tr>`,
              )
              .join('') || '<tr><td colspan="8">Nenhum item no período.</td></tr>'
          }
          </tbody></table>`;
        if (abrirParaImprimir(arquivo, corpo, janela)) setPronto(`Relatório com ${linhas.length} itens aberto numa aba nova. Use "Salvar como PDF" para guardar.`);
        else setErro('O navegador bloqueou a aba do relatório. Permita pop-ups para o portal e tente de novo.');
      }
    } catch (e) {
      janela?.close();
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o relatório.');
    } finally {
      setGerando(false);
    }
  }

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Gerar relatório"
      descricao="Obrigações, demandas e reuniões do período, com quem concluiu e quando."
      largura="md"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao type="submit" form="form-relatorio" carregando={gerando}>
            {formato === 'pdf' ? <FileText className="h-4 w-4" /> : <FileSpreadsheet className="h-4 w-4" />} Gerar
          </Botao>
        </>
      }
    >
      <form id="form-relatorio" onSubmit={gerar} className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="De (mês)" type="month" required value={de} onChange={(e) => setDe(e.target.value)} />
        <Campo rotulo="Até (mês)" type="month" required value={ate} onChange={(e) => setAte(e.target.value)} dica="Até 36 meses por relatório." />
        <div className="sm:col-span-2">
          <Selecao rotulo="Departamento" value={dept} onChange={(e) => setDept(e.target.value)} disabled={!todos}>
            {todos && <option value="">Todos os departamentos</option>}
            {deptosPermitidos.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Selecao>
        </div>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-texto-suave">Formato</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['pdf', 'PDF', 'Para imprimir e guardar', FileText],
                ['xlsx', 'Excel', 'Planilha com filtro', FileSpreadsheet],
              ] as const
            ).map(([v, r, d, Icone]) => (
              <button
                key={v}
                type="button"
                onClick={() => setFormato(v)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  formato === v ? 'border-marca-500 bg-marca-50 ring-1 ring-marca-500' : 'border-borda hover:border-marca-300',
                )}
                aria-pressed={formato === v}
              >
                <Icone className={cn('h-5 w-5', formato === v ? 'text-marca-700' : 'text-texto-fraco')} />
                <span>
                  <span className="block text-sm font-semibold text-texto">{r}</span>
                  <span className="block text-xs text-texto-suave">{d}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <Selecao rotulo="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
            <option value="">Todas</option>
            <option value="ok">Só concluídas</option>
            <option value="pend">Só pendentes e atrasadas</option>
          </Selecao>
        </div>
        {erro && <p className="rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro sm:col-span-2">{erro}</p>}
        {pronto && <p className="rounded-lg bg-sucesso-suave px-3 py-2 text-sm font-medium text-sucesso sm:col-span-2">{pronto}</p>}
      </form>
    </Modal>
  );
}
