'use client';

import { useEffect, useState } from 'react';

import { Lock, Save, X } from 'lucide-react';

import { AreaTexto, Botao, Campo, Selecao, Selo, cn, useAvisos } from '@/components/ui';
import { COLUNAS_ADMINISTRATIVAS, COLUNAS_GERAIS, type DefinicaoColuna } from '@/lib/colunas';
import { prepararValor, type LinhaEmpresa } from '@/lib/empresas';
import { formatarParaExibicao, mascararPorTipo } from '@/lib/mascaras';
import { cnpjValido, normalizarCnpj, normalizarData } from '@/lib/normalizacao';

/**
 * Formulário lateral para criar ou editar uma empresa por completo.
 * Alternativa à edição célula a célula, mais confortável para cadastro novo.
 */
export function PainelEmpresa({
  aberto,
  empresa,
  podeVerAdministrativo,
  podeEditar,
  colunasEditaveis = [],
  aoFechar,
  aoSalvar,
}: {
  aberto: boolean;
  /** null = cadastro de nova empresa */
  empresa: LinhaEmpresa | null;
  podeVerAdministrativo: boolean;
  podeEditar: boolean;
  /** Restrição pessoal de colunas. Vazio = sem restrição. */
  colunasEditaveis?: string[];
  aoFechar: () => void;
  aoSalvar: (
    gerais: Record<string, unknown>,
    administrativos: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const { avisar } = useAvisos();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba] = useState<'gerais' | 'administrativos'>('gerais');

  useEffect(() => {
    if (!aberto) return;

    const iniciais: Record<string, string> = {};
    for (const coluna of COLUNAS_GERAIS) {
      const bruto = empresa ? (empresa as unknown as Record<string, unknown>)[coluna.campo] : null;
      iniciais[coluna.campo] =
        coluna.tipo === 'data' || coluna.tipo === 'cnpj'
          ? formatarParaExibicao(coluna.tipo, bruto)
          : bruto === null || bruto === undefined
            ? ''
            : String(bruto);
    }
    if (podeVerAdministrativo) {
      for (const coluna of COLUNAS_ADMINISTRATIVAS) {
        const bruto = empresa?.administrativo
          ? (empresa.administrativo as unknown as Record<string, unknown>)[coluna.campo]
          : null;
        iniciais[coluna.campo] =
          coluna.tipo === 'data'
            ? formatarParaExibicao('data', bruto)
            : bruto === null || bruto === undefined
              ? ''
              : String(bruto);
      }
    }
    setValores(iniciais);
    setErros({});
    setAba('gerais');
  }, [aberto, empresa, podeVerAdministrativo]);

  if (!aberto) return null;

  function definir(campo: string, valor: string, tipo: DefinicaoColuna['tipo']) {
    setValores((atuais) => ({ ...atuais, [campo]: mascararPorTipo(tipo, valor) }));
    setErros((atuais) => {
      const { [campo]: _removido, ...resto } = atuais;
      return resto;
    });
  }

  function validarTudo(): boolean {
    const novos: Record<string, string> = {};

    if (!valores.razao_social?.trim()) novos.razao_social = 'Informe a razão social.';

    const cnpj = valores.cnpj?.trim();
    if (cnpj) {
      const digitos = normalizarCnpj(cnpj);
      if (!digitos || digitos.length !== 14) novos.cnpj = 'CNPJ deve ter 14 dígitos.';
      else if (!cnpjValido(digitos)) novos.cnpj = 'CNPJ com dígito verificador inválido.';
    }

    for (const coluna of [...COLUNAS_GERAIS, ...COLUNAS_ADMINISTRATIVAS]) {
      const valor = valores[coluna.campo]?.trim();
      if (!valor) continue;
      if (coluna.tipo === 'data' && !normalizarData(valor)) {
        novos[coluna.campo] = 'Use dd/mm/aaaa.';
      }
      if (coluna.tipo === 'numero' && coluna.campo === 'dia_vencimento') {
        const n = Number(valor);
        if (!Number.isFinite(n) || n < 1 || n > 31) novos[coluna.campo] = 'Dia entre 1 e 31.';
      }
    }

    setErros(novos);
    if (Object.keys(novos).length > 0) {
      const primeiro = Object.keys(novos)[0];
      setAba(COLUNAS_ADMINISTRATIVAS.some((c) => c.campo === primeiro) ? 'administrativos' : 'gerais');
      return false;
    }
    return true;
  }

  async function enviar() {
    if (!validarTudo()) {
      avisar('alerta', 'Revise os campos destacados antes de salvar.');
      return;
    }

    setSalvando(true);
    try {
      const gerais: Record<string, unknown> = {};
      for (const coluna of COLUNAS_GERAIS) {
        if (!coluna.editavel) continue;
        // Não enviar o que o usuário não pode mudar: o banco recusaria o
        // UPDATE inteiro e nada seria salvo.
        if (colunasEditaveis.length > 0 && !colunasEditaveis.includes(coluna.campo)) continue;
        gerais[coluna.campo] = prepararValor(coluna.campo, coluna.tipo, valores[coluna.campo] ?? '');
      }

      const administrativos: Record<string, unknown> = {};
      if (podeVerAdministrativo) {
        for (const coluna of COLUNAS_ADMINISTRATIVAS) {
          if (!coluna.editavel) continue;
          administrativos[coluna.campo] = prepararValor(
            coluna.campo,
            coluna.tipo,
            valores[coluna.campo] ?? '',
          );
        }
      }

      await aoSalvar(gerais, administrativos);
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  const colunasAba = aba === 'gerais' ? COLUNAS_GERAIS : COLUNAS_ADMINISTRATIVAS;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={aoFechar} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={empresa ? 'Editar empresa' : 'Nova empresa'}
        className="animar-painel relative flex h-full w-full max-w-xl flex-col bg-superficie-elevada shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-borda px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-texto">
              {empresa ? empresa.razao_social : 'Nova empresa'}
            </h2>
            <p className="mt-0.5 text-xs text-texto-suave">
              {empresa
                ? `Atualizado em ${new Date(empresa.updated_at).toLocaleString('pt-BR')}`
                : 'Preencha os dados. Apenas a razão social é obrigatória.'}
            </p>
          </div>
          <button
            onClick={aoFechar}
            className="rounded-lg p-1.5 text-texto-fraco transition-colors hover:bg-superficie hover:text-texto"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {podeVerAdministrativo && (
          <div className="flex gap-1 border-b border-borda px-5 pt-3">
            {(['gerais', 'administrativos'] as const).map((chave) => (
              <button
                key={chave}
                onClick={() => setAba(chave)}
                className={cn(
                  'flex items-center gap-1.5 rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-medium transition-colors',
                  aba === chave
                    ? 'border-marca-600 text-marca-800'
                    : 'border-transparent text-texto-suave hover:text-texto',
                )}
              >
                {chave === 'gerais' ? 'Dados gerais' : 'Dados administrativos'}
                {chave === 'administrativos' && <Lock className="h-3 w-3 text-alerta" />}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {aba === 'administrativos' && (
            <div className="rounded-lg border border-amber-200 bg-alerta-suave px-3.5 py-2.5 text-xs leading-relaxed text-alerta">
              <strong>Informação confidencial.</strong> Honorários e condições contratuais ficam em
              tabela separada, acessível apenas a administradores. Toda alteração é registrada na
              auditoria.
            </div>
          )}

          {colunasAba.map((coluna) => {
            // Fora das colunas atribuídas o campo aparece, mas travado — o
            // gatilho `aplicar_colunas_permitidas` recusaria a alteração.
            const foraDaAtribuicao =
              !coluna.confidencial &&
              colunasEditaveis.length > 0 &&
              !colunasEditaveis.includes(coluna.campo);
            const somenteLeitura = !coluna.editavel || !podeEditar || foraDaAtribuicao;

            if (coluna.tipo === 'longo') {
              return (
                <AreaTexto
                  key={coluna.campo}
                  rotulo={coluna.rotulo}
                  value={valores[coluna.campo] ?? ''}
                  onChange={(e) => definir(coluna.campo, e.target.value, coluna.tipo)}
                  erro={erros[coluna.campo]}
                  disabled={somenteLeitura || salvando}
                />
              );
            }

            if (coluna.tipo === 'booleano') {
              return (
                <label key={coluna.campo} className="flex items-center gap-2.5 py-1">
                  <input
                    type="checkbox"
                    checked={valores[coluna.campo] === 'true'}
                    onChange={(e) =>
                      setValores((v) => ({ ...v, [coluna.campo]: String(e.target.checked) }))
                    }
                    disabled={somenteLeitura || salvando}
                    className="h-4 w-4 rounded border-borda-forte text-marca-600"
                  />
                  <span className="text-sm font-medium text-texto-suave">{coluna.rotulo}</span>
                </label>
              );
            }

            if (coluna.opcoes) {
              return (
                <Selecao
                  key={coluna.campo}
                  rotulo={coluna.rotulo}
                  value={valores[coluna.campo] ?? ''}
                  onChange={(e) => definir(coluna.campo, e.target.value, coluna.tipo)}
                  erro={erros[coluna.campo]}
                  disabled={somenteLeitura || salvando}
                >
                  <option value="">— não informado —</option>
                  {coluna.opcoes.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {opcao}
                    </option>
                  ))}
                </Selecao>
              );
            }

            return (
              <Campo
                key={coluna.campo}
                rotulo={coluna.rotulo}
                value={valores[coluna.campo] ?? ''}
                onChange={(e) => definir(coluna.campo, e.target.value, coluna.tipo)}
                erro={erros[coluna.campo]}
                dica={coluna.origem}
                placeholder={
                  coluna.tipo === 'data' ? 'dd/mm/aaaa' : coluna.tipo === 'cnpj' ? '00.000.000/0000-00' : undefined
                }
                disabled={somenteLeitura || salvando}
              />
            );
          })}

          {empresa && aba === 'gerais' && (
            <div className="space-y-2 rounded-lg border border-borda bg-superficie p-3.5 text-xs">
              <p className="font-semibold text-texto-suave">Rastreabilidade</p>
              <div className="flex flex-wrap gap-2">
                <Selo tom="marca">Origem: {empresa.origem.replace('_', ' ')}</Selo>
                {empresa.linha_origem_saude && <Selo>Planilha Saúde · linha {empresa.linha_origem_saude}</Selo>}
                {empresa.linha_origem_adm && <Selo>Adm.xlsx · linha {empresa.linha_origem_adm}</Selo>}
                <Selo tom={empresa.cnpj_valido ? 'sucesso' : 'erro'}>
                  CNPJ {empresa.cnpj_valido ? 'válido' : 'inválido'}
                </Selo>
              </div>
              {empresa.revisao_motivo && (
                <p className="text-texto-suave">
                  <strong>Revisão:</strong> {empresa.revisao_motivo}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-borda bg-superficie px-5 py-3.5">
          <Botao variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Botao>
          <Botao onClick={enviar} carregando={salvando} disabled={!podeEditar}>
            <Save className="h-4 w-4" />
            {empresa ? 'Salvar alterações' : 'Cadastrar empresa'}
          </Botao>
        </footer>
      </div>
    </div>
  );
}
