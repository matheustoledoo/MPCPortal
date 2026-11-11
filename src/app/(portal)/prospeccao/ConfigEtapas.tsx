'use client';

import { useState } from 'react';

import { ArrowDown, ArrowUp, Plus } from 'lucide-react';

import { Botao, Campo, Modal, Selecao, Selo, useAvisos } from '@/components/ui';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { EtapaProspeccao, Lead } from '@/types/banco';

const CORES = ['#64748b', '#2f62c9', '#b7791f', '#7b4fc4', '#0e7490', '#c2417a', '#15803d', '#b91c1c', '#9b1c24'];

/**
 * Etapas do funil — só administradores (o banco recusa os demais).
 * Etapa com leads não é apagada: é desativada, e os leads continuam nela
 * até serem movidos. Assim o histórico não perde referência.
 */
export function ConfigEtapas({ etapas: iniciais, leads, aoFechar }: { etapas: EtapaProspeccao[]; leads: Lead[]; aoFechar: () => void }) {
  const { avisar } = useAvisos();
  const [etapas, setEtapas] = useState(() => [...iniciais].sort((a, b) => a.ordem - b.ordem));
  const [novoNome, setNovoNome] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const usados = (id: string) => leads.filter((l) => l.etapa_id === id).length;

  async function atualizar(id: string, patch: Partial<EtapaProspeccao>) {
    const anterior = etapas;
    setEtapas((lista) => lista.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    const { error } = await criarClienteNavegador().from('prospeccao_etapas').update(patch).eq('id', id);
    if (error) {
      setEtapas(anterior);
      avisar('erro', `Não foi possível salvar: ${error.message}`);
    }
  }

  async function trocar(indice: number, direcao: -1 | 1) {
    const a = etapas[indice];
    const b = etapas[indice + direcao];
    if (!a || !b) return;
    setOcupado(true);
    const supabase = criarClienteNavegador();
    const r1 = await supabase.from('prospeccao_etapas').update({ ordem: b.ordem }).eq('id', a.id);
    const r2 = await supabase.from('prospeccao_etapas').update({ ordem: a.ordem }).eq('id', b.id);
    setOcupado(false);
    if (r1.error || r2.error) return avisar('erro', `Não foi possível reordenar: ${(r1.error ?? r2.error)?.message}`);
    setEtapas((lista) => lista.map((e) => (e.id === a.id ? { ...e, ordem: b.ordem } : e.id === b.id ? { ...e, ordem: a.ordem } : e)).sort((x, y) => x.ordem - y.ordem));
  }

  async function criar() {
    const nome = novoNome.trim();
    if (!nome) return;
    setOcupado(true);
    const ordem = Math.max(0, ...etapas.map((e) => e.ordem)) + 1;
    const { data, error } = await criarClienteNavegador()
      .from('prospeccao_etapas')
      .insert({ nome, ordem, cor: CORES[etapas.length % CORES.length], tipo: 'aberta' })
      .select('*')
      .single();
    setOcupado(false);
    if (error || !data) return avisar('erro', `Não foi possível criar: ${error?.message ?? ''}`);
    setNovoNome('');
    setEtapas((lista) => [...lista, data as EtapaProspeccao].sort((x, y) => x.ordem - y.ordem));
    avisar('sucesso', 'Etapa criada. Use as setas para posicioná-la no funil.');
  }

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      largura="lg"
      titulo="Etapas do funil"
      descricao="Renomeie, reordene, mude a cor ou desative etapas. Somente administradores alteram a estrutura do funil."
      rodape={<Botao onClick={aoFechar}>Concluir</Botao>}
    >
      <ul className="space-y-2">
        {etapas.map((e, i) => (
          <li key={e.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-borda bg-white p-2.5">
            <div className="flex flex-col">
              <button disabled={i === 0 || ocupado} onClick={() => void trocar(i, -1)} className="rounded p-0.5 text-texto-fraco hover:text-texto disabled:opacity-30" aria-label={`Subir ${e.nome}`}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button disabled={i === etapas.length - 1 || ocupado} onClick={() => void trocar(i, 1)} className="rounded p-0.5 text-texto-fraco hover:text-texto disabled:opacity-30" aria-label={`Descer ${e.nome}`}><ArrowDown className="h-3.5 w-3.5" /></button>
            </div>
            <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded-full ring-2 ring-borda" title="Cor da etapa" style={{ backgroundColor: e.cor }}>
              <input type="color" value={e.cor} onChange={(ev) => void atualizar(e.id, { cor: ev.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`Cor de ${e.nome}`} />
            </label>
            <div className="min-w-[180px] flex-1">
              <Campo
                defaultValue={e.nome}
                maxLength={60}
                aria-label="Nome da etapa"
                onBlur={(ev) => {
                  const nome = ev.target.value.trim();
                  if (nome && nome !== e.nome) void atualizar(e.id, { nome });
                  else ev.target.value = e.nome;
                }}
              />
            </div>
            <div className="w-44">
              <Selecao aria-label="Tipo da etapa" value={e.tipo} onChange={(ev) => void atualizar(e.id, { tipo: ev.target.value as EtapaProspeccao['tipo'] })}>
                <option value="aberta">Em andamento</option>
                <option value="ganha">Fecha como cliente</option>
                <option value="perdida">Fecha como perda</option>
              </Selecao>
            </div>
            <Selo tom="neutro">{usados(e.id)} lead(s)</Selo>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-texto-suave">
              <input type="checkbox" checked={e.ativo} onChange={(ev) => void atualizar(e.id, { ativo: ev.target.checked })} className="h-4 w-4 accent-[var(--color-marca-600)]" />
              Ativa
            </label>
          </li>
        ))}
      </ul>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void criar(); }}>
        <Campo value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome da nova etapa" maxLength={60} aria-label="Nova etapa" />
        <Botao type="submit" variante="secundario" carregando={ocupado} disabled={!novoNome.trim()} className="shrink-0"><Plus className="h-4 w-4" /> Adicionar etapa</Botao>
      </form>
      <p className="mt-3 text-xs text-texto-fraco">Etapas desativadas somem do quadro, mas os leads que estão nelas continuam aparecendo na Lista até serem movidos. Os indicadores usam o tipo da etapa para contar conversões e perdas.</p>
    </Modal>
  );
}
