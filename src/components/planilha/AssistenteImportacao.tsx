'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';

import { Botao, Modal, Selecao, Selo, cn } from '@/components/ui';
import {
  CAMPOS_EDITAVEIS_ADMINISTRATIVOS,
  CAMPOS_EDITAVEIS_GERAIS,
  campoAPartirDoRotulo,
  type DefinicaoColuna,
} from '@/lib/colunas';
import { prepararValor, type LinhaEmpresa } from '@/lib/empresas';
import {
  ACOES_REPETIDA,
  chaveEmpresa,
  detectarCabecalho,
  lerArquivo,
  sugerirMapeamento,
  type AbaLida,
  type AcaoRepetida,
} from '@/lib/planilha/importacao';
import { normalizarCnpj, normalizarData, normalizarNumero, normalizarTexto } from '@/lib/normalizacao';

const NOVA_COLUNA = '__nova__';

type Etapa = 'arquivo' | 'mapear' | 'revisar' | 'executando' | 'fim';

interface ItemPlano {
  linhaArquivo: number;
  razao: string;
  cnpj: string | null;
  gerais: Record<string, unknown>;
  administrativos: Record<string, unknown>;
  extrasGerais: Record<string, unknown>;
  extrasAdm: Record<string, unknown>;
  existente: LinhaEmpresa | null;
  repetidaNoArquivo: boolean;
  avisos: string[];
}

interface Resultado {
  criadas: number;
  atualizadas: number;
  ignoradas: number;
  erros: { linha: number; razao: string; mensagem: string }[];
  colunasCriadas: string[];
}

/**
 * Assistente "Importar": lê qualquer planilha, entende as colunas, mostra o
 * que vai acontecer e só então grava — tudo com a RLS de quem importa.
 */
export function AssistenteImportacao({
  aberto,
  aoFechar,
  supabase,
  colunas,
  existentes,
  podeVerAdministrativo,
  podeCriarEmpresas,
  podeAtualizar,
  podeCriarColunas,
  podeEditarColuna,
  aoConcluir,
}: {
  aberto: boolean;
  aoFechar: () => void;
  supabase: SupabaseClient;
  colunas: DefinicaoColuna[];
  existentes: LinhaEmpresa[];
  podeVerAdministrativo: boolean;
  podeCriarEmpresas: boolean;
  podeAtualizar: boolean;
  podeCriarColunas: boolean;
  podeEditarColuna: (coluna: DefinicaoColuna) => boolean;
  aoConcluir: () => Promise<void> | void;
}) {
  const [etapa, setEtapa] = useState<Etapa>('arquivo');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [abas, setAbas] = useState<AbaLida[]>([]);
  const [abaAtual, setAbaAtual] = useState(0);
  const [linhaCabecalho, setLinhaCabecalho] = useState(0);
  const [mapa, setMapa] = useState<string[]>([]);
  const [acao, setAcao] = useState<AcaoRepetida>('completar');
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [progresso, setProgresso] = useState({ feito: 0, total: 0 });
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const destinos = useMemo(
    () =>
      colunas.filter(
        (c) =>
          c.editavel &&
          c.tipo !== 'formula' &&
          c.tipo !== 'processos' &&
          (!c.confidencial || podeVerAdministrativo) &&
          podeEditarColuna(c),
      ),
    [colunas, podeVerAdministrativo, podeEditarColuna],
  );
  const porCampo = useMemo(() => new Map(destinos.map((c) => [c.campo, c])), [destinos]);

  const aba = abas[abaAtual];
  const cabecalhos = useMemo(
    () => (aba?.linhas[linhaCabecalho] ?? []).map((v, i) => (v === null || v === '' ? `Coluna ${i + 1}` : String(v))),
    [aba, linhaCabecalho],
  );
  const dados = useMemo(
    () => (aba ? aba.linhas.slice(linhaCabecalho + 1).filter((l) => l.some((v) => v !== null && v !== '')) : []),
    [aba, linhaCabecalho],
  );

  function reiniciar() {
    setEtapa('arquivo');
    setAbas([]);
    setMapa([]);
    setErro(null);
    setResultado(null);
    setProgresso({ feito: 0, total: 0 });
  }

  function fechar() {
    if (etapa === 'executando') return;
    reiniciar();
    aoFechar();
  }

  async function abrirArquivo(arquivo: File) {
    setErro(null);
    setLendo(true);
    try {
      const lidas = (await lerArquivo(arquivo)).filter((a) => a.linhas.length > 0);
      if (lidas.length === 0) throw new Error('A planilha está vazia.');
      // A aba com mais linhas costuma ser a de dados.
      const principal = lidas.reduce((m, a, i) => (a.linhas.length > lidas[m].linhas.length ? i : m), 0);
      const cab = detectarCabecalho(lidas[principal].linhas, destinos);
      setNomeArquivo(arquivo.name);
      setAbas(lidas);
      escolherAba(lidas, principal, cab);
      setEtapa('mapear');
    } catch (e) {
      setErro(
        e instanceof Error
          ? `Não foi possível ler o arquivo: ${e.message}`
          : 'Não foi possível ler o arquivo. Confira se é Excel (.xlsx/.xls), LibreOffice (.ods) ou CSV.',
      );
    } finally {
      setLendo(false);
    }
  }

  function escolherAba(lista: AbaLida[], indice: number, cabecalho?: number) {
    const cab = cabecalho ?? detectarCabecalho(lista[indice].linhas, destinos);
    setAbaAtual(indice);
    setLinhaCabecalho(cab);
    const titulos = (lista[indice].linhas[cab] ?? []).map((v) => (v === null ? '' : String(v)));
    setMapa(sugerirMapeamento(titulos, destinos));
  }

  function mudarCabecalho(linha: number) {
    setLinhaCabecalho(linha);
    const titulos = (aba?.linhas[linha] ?? []).map((v) => (v === null ? '' : String(v)));
    setMapa(sugerirMapeamento(titulos, destinos));
  }

  /* ----------------------------- Plano --------------------------------- */

  const plano = useMemo((): ItemPlano[] => {
    if (etapa !== 'revisar' && etapa !== 'executando') return [];
    const indiceExistentes = new Map<string, LinhaEmpresa>();
    for (const e of existentes) {
      const k = chaveEmpresa(e.cnpj, e.razao_social);
      if (k && !indiceExistentes.has(k)) indiceExistentes.set(k, e);
    }
    const vistos = new Set<string>();

    return dados.map((linha, i) => {
      const item: ItemPlano = {
        linhaArquivo: linhaCabecalho + 2 + i,
        razao: '',
        cnpj: null,
        gerais: {},
        administrativos: {},
        extrasGerais: {},
        extrasAdm: {},
        existente: null,
        repetidaNoArquivo: false,
        avisos: [],
      };

      mapa.forEach((destino, j) => {
        if (!destino) return;
        const bruto = linha[j];
        if (bruto === null || bruto === undefined || bruto === '') return;

        if (destino === NOVA_COLUNA) {
          // Chave provisória por posição; vira o nome técnico na gravação.
          item.extrasGerais[`${NOVA_COLUNA}${j}`] = typeof bruto === 'number' ? bruto : String(bruto).trim();
          return;
        }
        const coluna = porCampo.get(destino);
        if (!coluna) return;

        let valor: unknown;
        if (coluna.tipo === 'data') {
          valor = normalizarData(bruto);
          if (!valor) {
            item.avisos.push(`${coluna.rotulo}: "${bruto}" não é uma data — ignorado.`);
            return;
          }
        } else if (coluna.tipo === 'numero' || coluna.tipo === 'moeda') {
          valor = normalizarNumero(bruto);
          if (valor === null) {
            item.avisos.push(`${coluna.rotulo}: "${bruto}" não é um número — ignorado.`);
            return;
          }
          if (coluna.campo === 'dia_vencimento') {
            const n = Math.round(valor as number);
            if (n < 1 || n > 31) {
              item.avisos.push(`Dia de vencimento "${bruto}" fora de 1–31 — ignorado.`);
              return;
            }
            valor = n;
          }
        } else if (coluna.tipo === 'cnpj') {
          valor = normalizarCnpj(bruto);
        } else {
          valor = prepararValor(coluna.campo, coluna.tipo, typeof bruto === 'number' ? String(bruto) : bruto);
        }
        if (valor === null || valor === undefined) return;

        if (coluna.personalizada) {
          (coluna.confidencial ? item.extrasAdm : item.extrasGerais)[coluna.campo] = valor;
        } else if (coluna.confidencial) {
          item.administrativos[coluna.campo] = valor;
        } else {
          item.gerais[coluna.campo] = valor;
        }
      });

      item.razao = String(item.gerais.razao_social ?? '');
      item.cnpj = (item.gerais.cnpj as string | undefined) ?? null;
      const k = chaveEmpresa(item.cnpj, item.razao);
      if (k) {
        item.existente = indiceExistentes.get(k) ?? null;
        if (vistos.has(k)) item.repetidaNoArquivo = true;
        vistos.add(k);
      }
      if (item.cnpj && item.cnpj.length !== 14) item.avisos.push('CNPJ incompleto — a empresa entra marcada para revisão.');
      return item;
    });
  }, [etapa, dados, mapa, porCampo, existentes, linhaCabecalho]);

  const resumo = useMemo(() => {
    let novas = 0;
    let repetidas = 0;
    let semNome = 0;
    let duplicadasArquivo = 0;
    let comAviso = 0;
    for (const item of plano) {
      if (item.avisos.length) comAviso++;
      if (item.repetidaNoArquivo) duplicadasArquivo++;
      if (item.existente) repetidas++;
      else if (!item.razao) semNome++;
      else if (!item.repetidaNoArquivo || acao === 'adicionar') novas++;
    }
    return { novas, repetidas, semNome, duplicadasArquivo, comAviso };
  }, [plano, acao]);

  function situacao(item: ItemPlano): { rotulo: string; tom: 'sucesso' | 'info' | 'neutro' | 'alerta' | 'erro' } {
    if (!item.existente) {
      if (!item.razao) return { rotulo: 'Sem razão social', tom: 'erro' };
      if (item.repetidaNoArquivo && acao !== 'adicionar') return { rotulo: 'Repetida no arquivo', tom: 'neutro' };
      return podeCriarEmpresas ? { rotulo: 'Nova', tom: 'sucesso' } : { rotulo: 'Sem permissão para criar', tom: 'erro' };
    }
    switch (acao) {
      case 'substituir':
        return { rotulo: 'Substitui', tom: 'info' };
      case 'completar':
        return { rotulo: 'Completa vazios', tom: 'info' };
      case 'pular':
        return { rotulo: 'Ignorada', tom: 'neutro' };
      default:
        return { rotulo: 'Adiciona outra', tom: 'alerta' };
    }
  }

  /* ----------------------------- Execução ------------------------------ */

  async function executar() {
    setEtapa('executando');
    const r: Resultado = { criadas: 0, atualizadas: 0, ignoradas: 0, erros: [], colunasCriadas: [] };

    // 1. Colunas novas pedidas no mapeamento
    const novas = new Map<string, string>();
    const existentesCampos = colunas.map((c) => c.campo);
    for (const [j, destino] of mapa.entries()) {
      if (destino !== NOVA_COLUNA) continue;
      const rotulo = cabecalhos[j].slice(0, 80);
      const campo = campoAPartirDoRotulo(rotulo, [...existentesCampos, ...novas.values()]);
      const valores = dados.map((l) => l[j]).filter((v) => v !== null && v !== '');
      const tipo = valores.length && valores.every((v) => normalizarData(v)) ? 'data' : valores.length && valores.every((v) => typeof v === 'number') ? 'numero' : 'texto';
      const { error } = await supabase.from('planilha_colunas').insert({
        tabela: 'legalizacao_empresas',
        campo,
        personalizada: true,
        rotulo,
        tipo,
        formato: 'texto',
        largura: 160,
        ordem: existentesCampos.length + novas.size,
        descricao: `Criada na importação de ${nomeArquivo}`,
      });
      if (error) {
        r.erros.push({ linha: 1, razao: rotulo, mensagem: `Coluna não criada: ${error.message}` });
        continue;
      }
      novas.set(`${NOVA_COLUNA}${j}`, campo);
      r.colunasCriadas.push(rotulo);
    }

    const itens = plano.map((item) => {
      // As colunas novas ganham o nome técnico definitivo.
      const extras: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item.extrasGerais)) {
        if (k.startsWith(NOVA_COLUNA)) {
          const campo = novas.get(k);
          if (campo) extras[campo] = tipoDaNova(v);
        } else extras[k] = v;
      }
      return { ...item, extrasGerais: extras };
    });

    setProgresso({ feito: 0, total: itens.length });
    let feitos = 0;
    const contagemCnpj = new Map<string, number>();
    for (const e of existentes) if (e.cnpj) contagemCnpj.set(e.cnpj, (contagemCnpj.get(e.cnpj) ?? 0) + 1);

    async function processar(item: ItemPlano) {
      try {
        if (!item.razao && !item.existente) {
          r.ignoradas++;
          return;
        }

        const criarNova = !item.existente
          ? !item.repetidaNoArquivo || acao === 'adicionar'
          : acao === 'adicionar';

        // Segunda ocorrência no próprio arquivo, sem "adicionar mesmo assim".
        if (!criarNova && !item.existente) {
          r.ignoradas++;
          return;
        }

        if (criarNova) {
          if (!podeCriarEmpresas) {
            r.ignoradas++;
            return;
          }
          const registro: Record<string, unknown> = {
            ...filtrar(item.gerais, CAMPOS_EDITAVEIS_GERAIS),
            razao_social: item.razao || item.existente?.razao_social,
            origem: 'manual',
            campos_extras: item.extrasGerais,
          };
          if (item.cnpj) {
            const n = contagemCnpj.get(item.cnpj) ?? 0;
            // Repetida de propósito: a chave "<cnpj>#<n>" é a que o banco aceita.
            registro.chave_identificacao = n > 0 ? `${item.cnpj}#${n + 1}` : item.cnpj;
            contagemCnpj.set(item.cnpj, n + 1);
          } else {
            // Sem CNPJ, a chave padrão é razão+cidade: a cópia pedida precisa de outra.
            registro.chave_identificacao =
              item.existente || item.repetidaNoArquivo ? `SEMCNPJ:IMPORTACAO:${crypto.randomUUID()}` : '';
          }
          const { data, error } = await supabase.from('legalizacao_empresas').insert(registro).select('id').single();
          if (error) throw new Error(error.code === '23505' ? 'Já existe uma empresa com esta identificação.' : error.message);
          await gravarAdm((data as { id: string }).id, item, null);
          r.criadas++;
          return;
        }

        const alvo = item.existente!;
        if (acao === 'pular' || !podeAtualizar) {
          r.ignoradas++;
          return;
        }

        const gerais = filtrar(item.gerais, CAMPOS_EDITAVEIS_GERAIS);
        const mudancas: Record<string, unknown> = {};
        for (const [campo, valor] of Object.entries(gerais)) {
          const atual = (alvo as unknown as Record<string, unknown>)[campo];
          if (acao === 'completar' && atual !== null && atual !== undefined && atual !== '') continue;
          if (atual === valor) continue;
          mudancas[campo] = valor;
        }
        const extras = { ...(alvo.campos_extras ?? {}) };
        let extrasMudaram = false;
        for (const [campo, valor] of Object.entries(item.extrasGerais)) {
          const atual = extras[campo];
          if (acao === 'completar' && atual !== null && atual !== undefined && atual !== '') continue;
          if (atual === valor) continue;
          extras[campo] = valor;
          extrasMudaram = true;
        }
        if (extrasMudaram) mudancas.campos_extras = extras;

        const admMudou = await gravarAdm(alvo.id, item, alvo);
        if (Object.keys(mudancas).length > 0) {
          const { error } = await supabase.from('legalizacao_empresas').update(mudancas).eq('id', alvo.id);
          if (error) throw new Error(error.message);
        }
        if (Object.keys(mudancas).length > 0 || admMudou) r.atualizadas++;
        else r.ignoradas++;
      } catch (e) {
        r.erros.push({
          linha: item.linhaArquivo,
          razao: item.razao || item.existente?.razao_social || '—',
          mensagem: e instanceof Error ? e.message : String(e),
        });
      } finally {
        feitos++;
        setProgresso({ feito: feitos, total: itens.length });
      }
    }

    async function gravarAdm(empresaId: string, item: ItemPlano, alvo: LinhaEmpresa | null): Promise<boolean> {
      if (!podeVerAdministrativo) return false;
      const adm = filtrar(item.administrativos, CAMPOS_EDITAVEIS_ADMINISTRATIVOS);
      const atual = (alvo?.administrativo ?? null) as unknown as Record<string, unknown> | null;
      const mudancas: Record<string, unknown> = {};
      for (const [campo, valor] of Object.entries(adm)) {
        const antes = atual?.[campo];
        if (acao === 'completar' && antes !== null && antes !== undefined && antes !== '') continue;
        if (antes === valor) continue;
        mudancas[campo] = valor;
      }
      if (Object.keys(item.extrasAdm).length) {
        const extras = { ...((atual?.campos_extras as Record<string, unknown>) ?? {}) };
        let mudou = false;
        for (const [campo, valor] of Object.entries(item.extrasAdm)) {
          if (acao === 'completar' && extras[campo] !== undefined && extras[campo] !== '') continue;
          if (extras[campo] === valor) continue;
          extras[campo] = valor;
          mudou = true;
        }
        if (mudou) mudancas.campos_extras = extras;
      }
      if (Object.keys(mudancas).length === 0) return false;
      const { error } = await supabase
        .from('legalizacao_dados_administrativos')
        .upsert({ empresa_id: empresaId, ...mudancas }, { onConflict: 'empresa_id' });
      if (error) throw new Error(`Dados ADM: ${error.message}`);
      return true;
    }

    // Quatro de cada vez: rápido sem atropelar o banco.
    const fila = [...itens];
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let item = fila.shift(); item; item = fila.shift()) await processar(item);
      }),
    );

    await supabase.rpc('registrar_evento_auditoria', {
      p_acao: 'IMPORT',
      p_tabela: 'legalizacao_empresas',
      p_registro_id: null,
      p_contexto: {
        origem: 'assistente de importação',
        arquivo: nomeArquivo,
        aba: aba?.nome,
        linhas: itens.length,
        acao_repetidas: acao,
        criadas: r.criadas,
        atualizadas: r.atualizadas,
        ignoradas: r.ignoradas,
        erros: r.erros.length,
        colunas_criadas: r.colunasCriadas,
      },
      p_dados_novos: null,
    });

    setResultado(r);
    setEtapa('fim');
    await aoConcluir();
  }

  /* ------------------------------ Tela --------------------------------- */

  const razaoMapeada = mapa.includes('razao_social');
  const mapeadas = mapa.filter(Boolean).length;

  return (
    <Modal
      aberto={aberto}
      aoFechar={fechar}
      largura="xl"
      titulo="Importar planilha"
      descricao={
        etapa === 'arquivo'
          ? 'Traga empresas de qualquer planilha — Excel, LibreOffice, Google Planilhas ou CSV.'
          : nomeArquivo
      }
      rodape={
        etapa === 'mapear' ? (
          <>
            <Botao variante="secundario" onClick={reiniciar}>
              <ArrowLeft className="h-4 w-4" /> Outro arquivo
            </Botao>
            <Botao onClick={() => setEtapa('revisar')} disabled={!razaoMapeada && !mapa.includes('cnpj')}>
              Revisar <ArrowRight className="h-4 w-4" />
            </Botao>
          </>
        ) : etapa === 'revisar' ? (
          <>
            <Botao variante="secundario" onClick={() => setEtapa('mapear')}>
              <ArrowLeft className="h-4 w-4" /> Voltar ao mapeamento
            </Botao>
            <Botao onClick={() => void executar()} disabled={plano.length === 0}>
              <Upload className="h-4 w-4" /> Importar {plano.length} linha(s)
            </Botao>
          </>
        ) : etapa === 'fim' ? (
          <>
            <Botao variante="secundario" onClick={reiniciar}>
              Importar outro arquivo
            </Botao>
            <Botao onClick={fechar}>Fechar</Botao>
          </>
        ) : undefined
      }
    >
      {etapa === 'arquivo' && (
        <div className="space-y-4">
          <div
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setArrastando(false);
              const arquivo = e.dataTransfer.files[0];
              if (arquivo) void abrirArquivo(arquivo);
            }}
            onClick={() => entrada.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors',
              arrastando ? 'border-marca-500 bg-marca-50' : 'border-borda-forte hover:border-marca-300 hover:bg-superficie',
            )}
          >
            {lendo ? (
              <Loader2 className="h-8 w-8 animate-spin text-marca-600" />
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-marca-50 text-marca-600">
                <FileSpreadsheet className="h-7 w-7" />
              </span>
            )}
            <div>
              <p className="text-sm font-semibold text-texto">
                {lendo ? 'Lendo a planilha…' : 'Arraste o arquivo aqui ou clique para escolher'}
              </p>
              <p className="mt-1 text-xs text-texto-suave">.xlsx, .xls, .xlsm, .ods ou .csv — o arquivo é lido no seu computador.</p>
            </div>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void abrirArquivo(arquivo);
                e.target.value = '';
              }}
            />
          </div>
          <ul className="grid gap-2 text-xs text-texto-suave sm:grid-cols-3">
            <li className="rounded-lg bg-superficie p-3">
              <strong className="block text-texto">1. Reconhece as colunas</strong>
              “Razão social”, “Empresa”, “CNPJ”, “Município”, “AVCB”… em qualquer ordem, com qualquer acento.
            </li>
            <li className="rounded-lg bg-superficie p-3">
              <strong className="block text-texto">2. Cruza pelo CNPJ</strong>
              Sem CNPJ, compara a razão social. Você escolhe o que fazer com as repetidas.
            </li>
            <li className="rounded-lg bg-superficie p-3">
              <strong className="block text-texto">3. Mostra antes de gravar</strong>
              Nada vai para a base sem você confirmar. Tudo fica na auditoria.
            </li>
          </ul>
          {erro && (
            <p role="alert" className="rounded-lg border border-red-200 bg-erro-suave px-3.5 py-2.5 text-sm text-erro">
              {erro}
            </p>
          )}
        </div>
      )}

      {etapa === 'mapear' && aba && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {abas.length > 1 && (
              <div className="w-56">
                <Selecao rotulo="Aba" value={abaAtual} onChange={(e) => escolherAba(abas, Number(e.target.value))}>
                  {abas.map((a, i) => (
                    <option key={a.nome} value={i}>
                      {a.nome} ({a.linhas.length} linhas)
                    </option>
                  ))}
                </Selecao>
              </div>
            )}
            <div className="w-48">
              <Selecao rotulo="O cabeçalho está na linha" value={linhaCabecalho} onChange={(e) => mudarCabecalho(Number(e.target.value))}>
                {aba.linhas.slice(0, 25).map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </Selecao>
            </div>
            <p className="pb-2 text-sm text-texto-suave">
              <strong className="text-texto">{dados.length}</strong> linhas de dados ·{' '}
              <strong className="text-texto">{mapeadas}</strong> de {cabecalhos.length} colunas reconhecidas
            </p>
          </div>

          {!razaoMapeada && (
            <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-alerta-suave px-3.5 py-2.5 text-sm text-alerta">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Indique qual coluna é a <strong>Razão Social</strong>. Sem ela, só dá para atualizar empresas
              que já existem (pelo CNPJ).
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-borda">
            <table className="w-full text-sm">
              <thead className="bg-superficie text-left text-xs uppercase tracking-wide text-texto-suave">
                <tr>
                  <th className="px-3 py-2">Coluna do arquivo</th>
                  <th className="px-3 py-2">Exemplos</th>
                  <th className="w-80 px-3 py-2">Vai para</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {cabecalhos.map((cabecalho, j) => {
                  const exemplos = dados
                    .map((l) => l[j])
                    .filter((v) => v !== null && v !== '')
                    .slice(0, 3)
                    .map(String);
                  return (
                    <tr key={j} className={cn(!mapa[j] && 'bg-slate-50/60')}>
                      <td className="px-3 py-2 font-medium text-texto">{cabecalho}</td>
                      <td className="max-w-[340px] truncate px-3 py-2 text-xs text-texto-suave" title={exemplos.join(' · ')}>
                        {exemplos.join(' · ') || <span className="italic text-texto-fraco">vazia</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={mapa[j]?.startsWith(NOVA_COLUNA) ? NOVA_COLUNA : (mapa[j] ?? '')}
                          onChange={(e) =>
                            setMapa((atual) => {
                              const novo = [...atual];
                              const valor = e.target.value;
                              // Cada destino só recebe uma coluna do arquivo.
                              if (valor && valor !== NOVA_COLUNA) {
                                const anterior = novo.indexOf(valor);
                                if (anterior >= 0) novo[anterior] = '';
                              }
                              novo[j] = valor;
                              return novo;
                            })
                          }
                          className={cn(
                            'h-9 w-full rounded-lg border bg-white px-2 text-sm',
                            mapa[j] ? 'border-marca-300 text-texto' : 'border-borda-forte text-texto-fraco',
                          )}
                          aria-label={`Destino de ${cabecalho}`}
                        >
                          <option value="">— Ignorar esta coluna —</option>
                          <optgroup label="Base geral">
                            {destinos
                              .filter((c) => !c.confidencial && !c.personalizada)
                              .map((c) => (
                                <option key={c.campo} value={c.campo}>
                                  {c.rotulo}
                                </option>
                              ))}
                          </optgroup>
                          {destinos.some((c) => c.personalizada) && (
                            <optgroup label="Colunas da equipe">
                              {destinos
                                .filter((c) => c.personalizada)
                                .map((c) => (
                                  <option key={c.campo} value={c.campo}>
                                    {c.rotulo}
                                    {c.confidencial ? ' (ADM)' : ''}
                                  </option>
                                ))}
                            </optgroup>
                          )}
                          {podeVerAdministrativo && (
                            <optgroup label="Bloco ADM (confidencial)">
                              {destinos
                                .filter((c) => c.confidencial && !c.personalizada)
                                .map((c) => (
                                  <option key={c.campo} value={c.campo}>
                                    {c.rotulo}
                                  </option>
                                ))}
                            </optgroup>
                          )}
                          {podeCriarColunas && <option value={NOVA_COLUNA}>+ Criar coluna nova “{cabecalho.slice(0, 40)}”</option>}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {etapa === 'revisar' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Resumo rotulo="Empresas novas" valor={resumo.novas} tom="sucesso" />
            <Resumo rotulo="Já existem no portal" valor={resumo.repetidas} tom="info" />
            <Resumo rotulo="Repetidas no próprio arquivo" valor={resumo.duplicadasArquivo} tom="neutro" />
            <Resumo rotulo="Linhas com aviso" valor={resumo.comAviso} tom={resumo.comAviso ? 'alerta' : 'neutro'} />
          </div>

          {resumo.repetidas + resumo.duplicadasArquivo > 0 && (
            <div className="rounded-xl border border-borda p-3.5">
              <p className="mb-2 text-sm font-semibold text-texto">O que fazer com as empresas que já existem?</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {ACOES_REPETIDA.map((opcao) => (
                  <label
                    key={opcao.valor}
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors',
                      acao === opcao.valor ? 'border-marca-400 bg-marca-50' : 'border-borda hover:border-marca-200',
                    )}
                  >
                    <input
                      type="radio"
                      name="acao-repetida"
                      checked={acao === opcao.valor}
                      onChange={() => setAcao(opcao.valor)}
                      className="mt-0.5 h-3.5 w-3.5 text-marca-600"
                    />
                    <span>
                      <span className="block text-sm font-medium text-texto">{opcao.rotulo}</span>
                      <span className="block text-[11px] text-texto-suave">{opcao.descricao}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-texto-fraco">
                Em qualquer opção, célula vazia na planilha nunca apaga um dado do portal.
              </p>
            </div>
          )}

          {!podeCriarEmpresas && resumo.novas > 0 && (
            <p className="rounded-lg border border-amber-200 bg-alerta-suave px-3.5 py-2.5 text-sm text-alerta">
              Você não tem a permissão “Criar empresas”: as {resumo.novas} empresa(s) nova(s) serão ignoradas.
            </p>
          )}

          <div className="max-h-[38vh] overflow-auto rounded-xl border border-borda">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-superficie text-left text-xs uppercase tracking-wide text-texto-suave">
                <tr>
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Situação</th>
                  <th className="px-3 py-2">Razão social</th>
                  <th className="px-3 py-2">CNPJ</th>
                  <th className="px-3 py-2">Campos</th>
                  <th className="px-3 py-2">Avisos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borda">
                {plano.slice(0, 300).map((item) => {
                  const s = situacao(item);
                  const campos =
                    Object.keys(item.gerais).length +
                    Object.keys(item.administrativos).length +
                    Object.keys(item.extrasGerais).length +
                    Object.keys(item.extrasAdm).length;
                  return (
                    <tr key={item.linhaArquivo}>
                      <td className="px-3 py-1.5 tabular-nums text-texto-fraco">{item.linhaArquivo}</td>
                      <td className="px-3 py-1.5">
                        <Selo tom={s.tom}>{s.rotulo}</Selo>
                      </td>
                      <td className="max-w-[280px] truncate px-3 py-1.5 text-texto">
                        {item.razao || item.existente?.razao_social || '—'}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-texto-suave">{item.cnpj ?? '—'}</td>
                      <td className="px-3 py-1.5 tabular-nums text-texto-suave">{campos}</td>
                      <td className="max-w-[260px] truncate px-3 py-1.5 text-xs text-alerta" title={item.avisos.join('\n')}>
                        {item.avisos.join(' · ')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {plano.length > 300 && (
              <p className="border-t border-borda px-3 py-2 text-xs text-texto-fraco">
                Mostrando 300 de {plano.length} linhas. Todas serão importadas.
              </p>
            )}
          </div>
        </div>
      )}

      {etapa === 'executando' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-marca-600" />
          <p className="text-sm font-medium text-texto">
            Importando {progresso.feito} de {progresso.total}…
          </p>
          <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-marca-600 transition-all"
              style={{ width: `${progresso.total ? (progresso.feito / progresso.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-texto-fraco">Não feche esta janela.</p>
        </div>
      )}

      {etapa === 'fim' && resultado && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-sucesso-suave px-4 py-3 text-sm text-sucesso">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            Importação concluída e registrada na auditoria.
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Resumo rotulo="Criadas" valor={resultado.criadas} tom="sucesso" />
            <Resumo rotulo="Atualizadas" valor={resultado.atualizadas} tom="info" />
            <Resumo rotulo="Sem alteração / ignoradas" valor={resultado.ignoradas} tom="neutro" />
            <Resumo rotulo="Com erro" valor={resultado.erros.length} tom={resultado.erros.length ? 'erro' : 'neutro'} />
          </div>
          {resultado.colunasCriadas.length > 0 && (
            <p className="text-sm text-texto-suave">
              Colunas novas: <strong className="text-texto">{resultado.colunasCriadas.join(', ')}</strong>
            </p>
          )}
          {resultado.erros.length > 0 && (
            <ul className="max-h-60 divide-y divide-borda overflow-y-auto rounded-xl border border-red-200">
              {resultado.erros.map((e, i) => (
                <li key={i} className="flex items-start gap-2 px-3 py-2 text-xs">
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-erro" />
                  <span>
                    <strong>Linha {e.linha}</strong> · {e.razao}: <span className="text-erro">{e.mensagem}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

function Resumo({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: 'sucesso' | 'info' | 'neutro' | 'alerta' | 'erro' }) {
  const cores = {
    sucesso: 'border-green-200 bg-sucesso-suave/60 text-sucesso',
    info: 'border-blue-200 bg-info-suave/60 text-info',
    neutro: 'border-borda bg-superficie text-texto-suave',
    alerta: 'border-amber-200 bg-alerta-suave/60 text-alerta',
    erro: 'border-red-200 bg-erro-suave/60 text-erro',
  };
  return (
    <div className={cn('rounded-xl border px-4 py-3', cores[tom])}>
      <p className="text-2xl font-semibold tabular-nums">{valor.toLocaleString('pt-BR')}</p>
      <p className="text-xs font-medium">{rotulo}</p>
    </div>
  );
}

function filtrar(registro: Record<string, unknown>, permitidos: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(registro).filter(([campo]) => permitidos.includes(campo)));
}

/** Coluna criada na importação: datas e números já entram no formato certo. */
function tipoDaNova(valor: unknown): unknown {
  if (typeof valor === 'number') return valor;
  const data = normalizarData(valor);
  if (data && /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(String(valor))) return data;
  return normalizarTexto(valor);
}
