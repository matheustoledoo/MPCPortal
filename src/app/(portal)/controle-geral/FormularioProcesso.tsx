'use client';

import { useMemo, useState, type FormEvent } from 'react';

import { Building2, Info } from 'lucide-react';

import { BuscaEmpresa } from '@/components/processos/BuscaEmpresa';
import { AreaTexto, Botao, Campo, Combo, Selecao, Selo, cn } from '@/components/ui';
import { mascararCnpj } from '@/lib/mascaras';
import { formatarCnpj } from '@/lib/normalizacao';
import { ROTULO_SITUACAO, TOM_SITUACAO, situacaoProcesso } from '@/lib/processos';
import type { EmpresaSugerida, Perfil, Processo } from '@/types/banco';

export interface RascunhoProcesso {
  id: string | null;
  empresa_id: string | null;
  empresa: string;
  cnpj: string;
  status: string;
  tipo_servico: string | null;
  orgao: string | null;
  protocolo: string;
  data_entrada: string;
  prazo: string;
  responsavel_id: string | null;
  responsavel: string | null;
  proxima_acao: string | null;
  observacoes: string;
  indicador: string | null;
}

function hojeIso(deslocamento = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function rascunhoVazio(): RascunhoProcesso {
  return {
    id: null,
    empresa_id: null,
    empresa: '',
    cnpj: '',
    status: 'Em preparação',
    tipo_servico: null,
    orgao: null,
    protocolo: '',
    data_entrada: hojeIso(),
    prazo: '',
    responsavel_id: null,
    responsavel: null,
    proxima_acao: null,
    observacoes: '',
    indicador: null,
  };
}

export function rascunhoDe(processo: Processo): RascunhoProcesso {
  return {
    id: processo.id,
    empresa_id: processo.empresa_id,
    empresa: processo.empresa,
    cnpj: processo.cnpj ? formatarCnpj(processo.cnpj) : '',
    status: processo.status,
    tipo_servico: processo.tipo_servico,
    orgao: processo.orgao,
    protocolo: processo.protocolo ?? '',
    data_entrada: processo.data_entrada.slice(0, 10),
    prazo: processo.prazo?.slice(0, 10) ?? '',
    responsavel_id: processo.responsavel_id,
    responsavel: processo.responsavel,
    proxima_acao: processo.proxima_acao,
    observacoes: processo.observacoes ?? '',
    indicador: processo.indicador,
  };
}

/**
 * Sugestão de órgão a partir do tipo de serviço. Poupa um clique no caso
 * comum sem travar nada: continua editável, e só preenche o que está vazio.
 */
const ORGAO_PROVAVEL: Record<string, string> = {
  'Abertura': 'Junta',
  'Alteração contratual': 'Junta',
  'Consolidação': 'Junta',
  'Alteração de sócios': 'Junta',
  'Baixa': 'Junta',
  'Alvará': 'Prefeitura',
  'Renovação de alvará': 'Prefeitura',
  'Inscrição municipal': 'Prefeitura',
  'Certidão uso do solo': 'Prefeitura',
  'Vigilância': 'Vigilância Sanitária',
  'Bombeiros': 'Bombeiros',
  'AVCB / CLCB': 'Bombeiros',
  'Regularização fiscal': 'Receita Federal',
  'Certidão negativa': 'Receita Federal',
  'Registro órgão de classe': 'Órgão de classe',
  'Responsável técnico': 'Órgão de classe',
  'Licença ambiental': 'CETESB',
  'Inscrição estadual': 'Sefaz / Secretaria da Fazenda',
  'Cadastro CNES': 'Vigilância Sanitária',
};

/** Prazo típico em dias corridos, por tipo de serviço. */
const PRAZO_PROVAVEL: Record<string, number> = {
  'Abertura': 30,
  'Alteração contratual': 30,
  'Consolidação': 30,
  'Baixa': 60,
  'Alvará': 45,
  'Renovação de alvará': 45,
  'Vigilância': 60,
  'Bombeiros': 60,
  'AVCB / CLCB': 60,
  'Inscrição municipal': 20,
  'Certidão uso do solo': 20,
  'Regularização fiscal': 30,
  'Registro órgão de classe': 45,
  'Licença ambiental': 90,
};

export function FormularioProcesso({
  rascunho,
  aoMudar,
  aoSalvar,
  aoCancelar,
  opcoes,
  pessoas,
  podeAdicionarOpcao,
  aoAdicionarOpcao,
  salvando,
  erro,
}: {
  rascunho: RascunhoProcesso;
  aoMudar: (r: RascunhoProcesso) => void;
  aoSalvar: (evento: FormEvent) => void;
  aoCancelar: () => void;
  opcoes: Record<string, string[]>;
  pessoas: Pick<Perfil, 'id' | 'nome'>[];
  podeAdicionarOpcao: boolean;
  aoAdicionarOpcao: (grupo: string, valor: string) => Promise<void>;
  salvando: boolean;
  erro: string | null;
}) {
  const [empresaEscolhida, setEmpresaEscolhida] = useState<EmpresaSugerida | null>(null);

  const situacao = useMemo(
    () => situacaoProcesso(rascunho.prazo || null, rascunho.status),
    [rascunho.prazo, rascunho.status],
  );

  function definir<K extends keyof RascunhoProcesso>(campo: K, valor: RascunhoProcesso[K]) {
    aoMudar({ ...rascunho, [campo]: valor });
  }

  /** Aplica as sugestões sem sobrescrever o que a pessoa já preencheu. */
  function aoEscolherTipo(tipo: string | null) {
    const proximo = { ...rascunho, tipo_servico: tipo };
    if (tipo) {
      if (!proximo.orgao && ORGAO_PROVAVEL[tipo]) proximo.orgao = ORGAO_PROVAVEL[tipo];
      if (!proximo.prazo && PRAZO_PROVAVEL[tipo]) proximo.prazo = hojeIso(PRAZO_PROVAVEL[tipo]);
    }
    aoMudar(proximo);
  }

  const combo = (grupo: string) => ({
    opcoes: opcoes[grupo] ?? [],
    aoAdicionarOpcao: podeAdicionarOpcao
      ? (valor: string) => aoAdicionarOpcao(grupo, valor)
      : undefined,
  });

  return (
    <form onSubmit={aoSalvar} className="space-y-4" noValidate>
      <BuscaEmpresa
        valor={rascunho.empresa}
        autoFocus={!rascunho.id}
        aoEscolher={(empresa) => {
          setEmpresaEscolhida(empresa);
          aoMudar({
            ...rascunho,
            empresa_id: empresa.id,
            empresa: empresa.razao_social,
            cnpj: empresa.cnpj ? formatarCnpj(empresa.cnpj) : '',
            // O responsável do cadastro entra como sugestão quando ainda não
            // há ninguém definido para o processo.
            responsavel_id: rascunho.responsavel_id ?? empresa.responsavel_id,
          });
        }}
        aoDigitarLivre={(texto) => {
          setEmpresaEscolhida(null);
          aoMudar({ ...rascunho, empresa: texto, empresa_id: null });
        }}
      />

      {empresaEscolhida && (
        <div className="flex items-start gap-2.5 rounded-lg border border-marca-200 bg-marca-50 px-3.5 py-2.5 text-xs leading-relaxed text-marca-800">
          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Vinculado a <strong>{empresaEscolhida.razao_social}</strong>
            {empresaEscolhida.cidade && ` · ${empresaEscolhida.cidade}`}
            {empresaEscolhida.status && ` · ${empresaEscolhida.status}`}.
            {empresaEscolhida.processos_abertos > 0 && (
              <> Esta empresa já tem {empresaEscolhida.processos_abertos} processo(s) em aberto.</>
            )}
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          rotulo="CNPJ"
          value={rascunho.cnpj}
          onChange={(e) => definir('cnpj', mascararCnpj(e.target.value))}
          placeholder="00.000.000/0000-00"
          disabled={Boolean(rascunho.empresa_id)}
          dica={
            rascunho.empresa_id
              ? 'Vem do cadastro da empresa.'
              : 'Se este CNPJ já existir na base, o vínculo é criado sozinho.'
          }
        />

        <Combo
          rotulo="Status"
          valor={rascunho.status}
          aoMudar={(v) => definir('status', v ?? 'Em preparação')}
          {...combo('processo_status')}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Combo
          rotulo="Tipo de serviço"
          valor={rascunho.tipo_servico}
          aoMudar={aoEscolherTipo}
          dica="Escolher o tipo sugere o órgão e um prazo."
          {...combo('processo_tipo_servico')}
        />
        <Combo
          rotulo="Órgão"
          valor={rascunho.orgao}
          aoMudar={(v) => definir('orgao', v)}
          {...combo('processo_orgao')}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo
          rotulo="Protocolo"
          value={rascunho.protocolo}
          onChange={(e) => definir('protocolo', e.target.value)}
          placeholder="nº do protocolo no órgão"
        />
        <Campo
          rotulo="Data de entrada"
          type="date"
          value={rascunho.data_entrada}
          onChange={(e) => definir('data_entrada', e.target.value)}
        />
        <div>
          <Campo
            rotulo="Prazo"
            type="date"
            value={rascunho.prazo}
            onChange={(e) => definir('prazo', e.target.value)}
          />
          {rascunho.prazo && (
            <div className="mt-1.5">
              <Selo tom={TOM_SITUACAO[situacao]}>{ROTULO_SITUACAO[situacao]}</Selo>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Selecao
            rotulo="Responsável"
            value={rascunho.responsavel_id ?? ''}
            onChange={(e) =>
              aoMudar({
                ...rascunho,
                responsavel_id: e.target.value || null,
                responsavel: e.target.value ? null : rascunho.responsavel,
              })
            }
          >
            <option value="">— alguém de fora do portal —</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Selecao>
          {!rascunho.responsavel_id && (
            <div className="mt-2">
              <Campo
                value={rascunho.responsavel ?? ''}
                onChange={(e) => definir('responsavel', e.target.value || null)}
                placeholder="Nome do despachante, contador do cliente…"
              />
            </div>
          )}
        </div>

        <Combo
          rotulo="Indicador"
          valor={rascunho.indicador}
          aoMudar={(v) => definir('indicador', v)}
          dica="Marcação de prioridade. O alerta de prazo é automático."
          {...combo('processo_indicador')}
        />
      </div>

      <Combo
        rotulo="Próxima ação"
        valor={rascunho.proxima_acao}
        aoMudar={(v) => definir('proxima_acao', v)}
        {...combo('processo_proxima_acao')}
      />

      <AreaTexto
        rotulo="Observações"
        value={rascunho.observacoes}
        onChange={(e) => definir('observacoes', e.target.value)}
        placeholder="Exigências pendentes, contatos no órgão, número de guia…"
      />

      <p className="flex items-start gap-2 rounded-lg border border-borda bg-superficie px-3.5 py-2.5 text-[11px] leading-relaxed text-texto-suave">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marca-600" />
        <span>
          Em todos os campos com lista dá para digitar um valor que não está lá. Ele vale para
          este processo; quem tem permissão pode guardá-lo na lista do time no mesmo menu.
        </span>
      </p>

      {erro && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-erro-suave px-3.5 py-2.5 text-sm text-erro"
        >
          {erro}
        </div>
      )}

      <div className={cn('flex justify-end gap-2 border-t border-borda pt-4')}>
        <Botao type="button" variante="secundario" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={salvando}>
          {rascunho.id ? 'Salvar alterações' : 'Abrir processo'}
        </Botao>
      </div>
    </form>
  );
}
