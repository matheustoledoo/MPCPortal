'use client';

import { useState } from 'react';

import Link from 'next/link';
import { ArrowLeft, CopyPlus, Pencil } from 'lucide-react';

import { AreaTexto, Botao, Campo, Cartao, Modal, Selo, useAvisos } from '@/components/ui';
import { hojeIso } from '@/lib/atribuicoes';
import { dataBr } from '@/lib/ferramentas/calculos';
import { FERRAMENTAS, tabelasVigentes } from '@/lib/ferramentas/definicoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { TabelaFerramenta } from '@/types/banco';

type Dados = Record<string, unknown>;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const lista = (v: unknown): v is Dados[] => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object');

/** Conferência de estrutura: um JSON válido mas com campo faltando quebraria a calculadora. */
function validar(chave: string, d: Dados): string | null {
  const exigir = (...campos: string[]) => campos.find((c) => !num(d[c]));
  const crescente = (faixas: Dados[]) => faixas.every((f, i) => i === 0 || f.ate === null || Number(f.ate) > Number(faixas[i - 1].ate));
  switch (chave) {
    case 'salario_minimo':
      return exigir('valor') ? 'Informe "valor" numérico.' : null;
    case 'inss_empregado':
      if (exigir('teto')) return 'Informe "teto" numérico.';
      if (!lista(d.faixas) || !d.faixas.every((f) => num(f.ate) && num(f.aliquota))) return '"faixas" precisa de itens com "ate" e "aliquota" numéricos.';
      if (!crescente(d.faixas)) return 'As faixas precisam estar em ordem crescente de "ate".';
      return Number(d.faixas[d.faixas.length - 1].ate) === d.teto ? null : 'O "ate" da última faixa deve ser igual ao "teto".';
    case 'inss_individual': {
      const falta = exigir('minimo', 'teto', 'aliquota_prolabore', 'aliquota_normal', 'patronal');
      return falta ? `Campo numérico ausente: "${falta}".` : null;
    }
    case 'irrf_mensal': {
      const falta = exigir('dependente', 'desconto_simplificado');
      if (falta) return `Campo numérico ausente: "${falta}".`;
      if (!lista(d.faixas) || !d.faixas.every((f) => (f.ate === null || num(f.ate)) && num(f.aliquota) && num(f.deducao))) return '"faixas" precisa de itens com "ate" (número ou null), "aliquota" e "deducao".';
      if (d.faixas[d.faixas.length - 1].ate !== null) return 'A última faixa deve ter "ate": null (sem limite).';
      const r = d.reducao as Dados | undefined;
      if (r && ['isento_ate', 'limite', 'valor_maximo', 'constante', 'fator'].some((c) => !num(r[c]))) return '"reducao" precisa de isento_ate, limite, valor_maximo, constante e fator.';
      return null;
    }
    case 'fgts': {
      const falta = exigir('aliquota', 'aliquota_aprendiz', 'multa_sem_justa_causa', 'multa_acordo');
      return falta ? `Campo numérico ausente: "${falta}".` : null;
    }
    case 'aviso_previo': {
      const falta = exigir('dias_base', 'dias_por_ano', 'maximo');
      return falta ? `Campo numérico ausente: "${falta}".` : null;
    }
    case 'mei': {
      const falta = exigir('limite_anual', 'inss_percentual', 'icms', 'iss', 'caminhoneiro_percentual', 'limite_caminhoneiro');
      return falta ? `Campo numérico ausente: "${falta}".` : null;
    }
    case 'simples_nacional': {
      const falta = exigir('limite', 'sublimite', 'fator_r');
      if (falta) return `Campo numérico ausente: "${falta}".`;
      const anexos = d.anexos as Record<string, Dados> | undefined;
      if (!anexos || typeof anexos !== 'object') return 'Informe "anexos".';
      for (const [nome, a] of Object.entries(anexos)) {
        if (!Array.isArray(a.tributos) || !lista(a.faixas)) return `Anexo ${nome}: informe "tributos" e "faixas".`;
        for (const f of a.faixas) {
          if (!num(f.ate) || !num(f.aliquota) || !num(f.deducao) || !Array.isArray(f.reparticao)) return `Anexo ${nome}: cada faixa precisa de ate, aliquota, deducao e reparticao.`;
          if (f.reparticao.length !== a.tributos.length) return `Anexo ${nome}: a repartição precisa ter um percentual por tributo.`;
          const soma = (f.reparticao as number[]).reduce((s, x) => s + x, 0);
          if (Math.abs(soma - 100) > 0.011) return `Anexo ${nome}, faixa até ${String(f.ate)}: a repartição soma ${soma.toFixed(2)}%, e deveria somar 100%.`;
        }
        if (!crescente(a.faixas)) return `Anexo ${nome}: faixas fora de ordem.`;
      }
      return null;
    }
    case 'lucro_presumido': {
      const falta = exigir('irpj', 'adicional_irpj', 'limite_adicional_mensal', 'csll', 'pis', 'cofins');
      if (falta) return `Campo numérico ausente: "${falta}".`;
      const p = d.presuncao as Record<string, Dados> | undefined;
      if (!p || !p.servicos || !p.comercio) return '"presuncao" precisa ao menos de "servicos" e "comercio".';
      return Object.values(p).every((x) => num(x.irpj) && num(x.csll) && typeof x.nome === 'string') ? null : 'Cada atividade precisa de nome, irpj e csll.';
    }
    case 'lucro_real': {
      const falta = exigir('irpj', 'adicional_irpj', 'limite_adicional_mensal', 'csll', 'pis', 'cofins');
      return falta ? `Campo numérico ausente: "${falta}".` : null;
    }
    case 'acrescimos_federais': {
      const falta = exigir('multa_dia', 'multa_teto', 'juros_mes_pagamento');
      return falta ? `Campo numérico ausente: "${falta}".` : null;
    }
    default:
      return null;
  }
}

interface Rascunho {
  id: string | null;
  chave: string;
  titulo: string;
  vigencia_inicio: string;
  fonte: string;
  fonte_url: string;
  observacao: string;
  conferido_em: string;
  json: string;
}

export function EditorTabelas({ tabelasIniciais }: { tabelasIniciais: TabelaFerramenta[] }) {
  const { avisar } = useAvisos();
  const [tabelas, setTabelas] = useState(tabelasIniciais);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const hoje = hojeIso();
  const vigentes = tabelasVigentes(tabelas, hoje);
  const chaves = Array.from(new Set(tabelas.map((t) => t.chave)));

  const abrir = (t: TabelaFerramenta, nova: boolean) => {
    setErro(null);
    setRascunho({
      id: nova ? null : t.id,
      chave: t.chave,
      titulo: t.titulo,
      vigencia_inicio: nova ? hoje : t.vigencia_inicio,
      fonte: nova ? '' : t.fonte,
      fonte_url: t.fonte_url ?? '',
      observacao: t.observacao ?? '',
      conferido_em: hoje,
      json: JSON.stringify(t.dados, null, 2),
    });
  };

  async function salvar() {
    if (!rascunho) return;
    let dados: Dados;
    try {
      dados = JSON.parse(rascunho.json) as Dados;
    } catch (e) {
      return setErro(`JSON inválido: ${(e as Error).message}`);
    }
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return setErro('Os dados precisam ser um objeto JSON.');
    const problema = validar(rascunho.chave, dados);
    if (problema) return setErro(problema);
    if (!rascunho.fonte.trim()) return setErro('Informe a fonte legal (lei, portaria, decreto…). Sem fonte, a tabela não é salva.');
    if (!rascunho.vigencia_inicio) return setErro('Informe o início da vigência.');
    if (rascunho.fonte_url && !/^https:\/\//.test(rascunho.fonte_url)) return setErro('O link da fonte deve começar com https://');

    setSalvando(true);
    const registro = {
      chave: rascunho.chave,
      titulo: rascunho.titulo.trim(),
      vigencia_inicio: rascunho.vigencia_inicio,
      fonte: rascunho.fonte.trim(),
      fonte_url: rascunho.fonte_url.trim() || null,
      observacao: rascunho.observacao.trim() || null,
      conferido_em: rascunho.conferido_em || null,
      dados,
    };
    const supabase = criarClienteNavegador();
    const { error } = rascunho.id ? await supabase.from('ferramentas_tabelas').update(registro).eq('id', rascunho.id) : await supabase.from('ferramentas_tabelas').insert(registro);
    setSalvando(false);
    if (error) return setErro(error.code === '23505' ? 'Já existe uma tabela desta chave com esse início de vigência.' : error.message);
    const { data } = await supabase.from('ferramentas_tabelas').select('id, chave, vigencia_inicio, titulo, dados, fonte, fonte_url, observacao, conferido_em, updated_at').order('chave').order('vigencia_inicio', { ascending: false });
    if (data) setTabelas(data as TabelaFerramenta[]);
    setRascunho(null);
    avisar('sucesso', 'Tabela salva. As calculadoras já usam a versão vigente; a alteração ficou registrada na auditoria.');
  }

  return (
    <div className="space-y-5">
      <Link href="/ferramentas" className="inline-flex items-center gap-1.5 text-sm font-medium text-texto-suave hover:text-texto"><ArrowLeft className="h-4 w-4" /> Ferramentas</Link>

      <div className="grid gap-4 lg:grid-cols-2">
        {chaves.map((chave) => {
          const versoes = tabelas.filter((t) => t.chave === chave);
          const vigente = vigentes[chave];
          const usadaEm = FERRAMENTAS.filter((f) => f.tabelas.includes(chave)).map((f) => f.titulo);
          return (
            <Cartao key={chave} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-texto">{versoes[0].titulo}</h2>
                  <p className="mt-0.5 font-mono text-[11px] text-texto-fraco">{chave}</p>
                </div>
                <Botao variante="secundario" tamanho="sm" onClick={() => abrir(vigente ?? versoes[0], true)} title="Cria uma nova vigência a partir da atual"><CopyPlus className="h-4 w-4" /> Nova vigência</Botao>
              </div>
              {usadaEm.length > 0 && <p className="mt-2 text-xs text-texto-suave">Usada em: {usadaEm.join(', ')}.</p>}
              <ul className="mt-3 divide-y divide-borda rounded-lg border border-borda">
                {versoes.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm text-texto">
                        Desde {dataBr(t.vigencia_inicio)}
                        {vigente?.id === t.id ? <Selo tom="sucesso" className="text-[10px]">Em vigor</Selo> : t.vigencia_inicio > hoje ? <Selo tom="info" className="text-[10px]">Futura</Selo> : <Selo tom="neutro" className="text-[10px]">Anterior</Selo>}
                      </p>
                      <p className="truncate text-xs text-texto-suave" title={t.fonte}>{t.fonte}</p>
                      <p className="text-[11px] text-texto-fraco">{t.conferido_em ? `Conferida em ${dataBr(t.conferido_em)}` : 'Sem data de conferência'}</p>
                    </div>
                    <Botao variante="fantasma" tamanho="icone" onClick={() => abrir(t, false)} aria-label={`Editar vigência de ${dataBr(t.vigencia_inicio)}`}><Pencil className="h-4 w-4" /></Botao>
                  </li>
                ))}
              </ul>
            </Cartao>
          );
        })}
      </div>

      <Modal
        aberto={Boolean(rascunho)}
        aoFechar={() => setRascunho(null)}
        largura="lg"
        titulo={rascunho?.id ? 'Editar tabela' : 'Nova vigência'}
        descricao={rascunho ? `${rascunho.titulo} · ${rascunho.chave}` : undefined}
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setRascunho(null)}>Cancelar</Botao>
            <Botao onClick={() => void salvar()} carregando={salvando}>Salvar tabela</Botao>
          </>
        }
      >
        {rascunho && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Início da vigência *" type="date" value={rascunho.vigencia_inicio} onChange={(e) => setRascunho({ ...rascunho, vigencia_inicio: e.target.value })} />
              <Campo rotulo="Conferida em" type="date" value={rascunho.conferido_em} onChange={(e) => setRascunho({ ...rascunho, conferido_em: e.target.value })} />
              <div className="sm:col-span-2"><Campo rotulo="Fonte legal *" value={rascunho.fonte} onChange={(e) => setRascunho({ ...rascunho, fonte: e.target.value })} placeholder="Ex.: Portaria Interministerial MPS/MF nº …, de …" /></div>
              <div className="sm:col-span-2"><Campo rotulo="Link da fonte oficial" value={rascunho.fonte_url} onChange={(e) => setRascunho({ ...rascunho, fonte_url: e.target.value })} placeholder="https://www.gov.br/…" /></div>
              <div className="sm:col-span-2"><AreaTexto rotulo="Observação mostrada ao usuário" rows={2} value={rascunho.observacao} onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })} /></div>
            </div>
            <AreaTexto rotulo="Dados (JSON)" rows={14} spellCheck={false} value={rascunho.json} onChange={(e) => { setErro(null); setRascunho({ ...rascunho, json: e.target.value }); }} className="font-mono text-xs" />
            {erro && <p className="rounded-lg bg-erro-suave px-3 py-2 text-sm font-medium text-erro" role="alert">{erro}</p>}
            <p className="text-xs leading-relaxed text-texto-fraco">Percentuais são escritos como número (7,5% → <code>7.5</code>); valores em reais usam ponto decimal (<code>1621.00</code>). A estrutura é conferida antes de salvar. Prefira “Nova vigência” a editar uma tabela já usada: assim o histórico das regras fica preservado.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
