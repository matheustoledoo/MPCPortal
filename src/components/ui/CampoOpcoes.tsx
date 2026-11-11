'use client';

import { useState } from 'react';

import { Botao, Combo, Modal, Selecao, useAvisos } from '@/components/ui';
import { adicionarOpcao, excluirOpcao, useOpcoes, usoDaOpcao } from '@/lib/opcoes';

/**
 * Campo de seleção ligado a uma lista do banco, com "+ Adicionar outro".
 *
 * - quem tem `dados.opcoes.gerenciar` (prop `podeGerenciar`) vê a linha
 *   "+ Adicionar outro" e a lixeira nas opções personalizadas;
 * - opção padrão mostra um cadeado e não pode ser excluída;
 * - excluir uma opção em uso pede o que fazer com os registros que a usam.
 *
 * A permissão é conferida de novo no banco: esconder o botão é só conforto.
 */
export function CampoOpcoes({
  grupo,
  rotulo,
  valor,
  aoMudar,
  podeGerenciar,
  permiteLivre = false,
  placeholder,
  dica,
  erro,
  desabilitado,
  tamanho,
  className,
  classeValor,
  autoFocus,
}: {
  grupo: string;
  rotulo?: string;
  valor: string | null;
  aoMudar: (valor: string | null) => void;
  podeGerenciar: boolean;
  /** Aceita valor digitado sem salvar na lista (vale só para o registro). */
  permiteLivre?: boolean;
  placeholder?: string;
  dica?: string;
  erro?: string;
  desabilitado?: boolean;
  tamanho?: 'sm' | 'md';
  className?: string;
  classeValor?: string;
  autoFocus?: boolean;
}) {
  const { avisar } = useAvisos();
  const lista = useOpcoes(grupo)[grupo];
  const valores = lista.map((o) => o.valor);
  // O valor salvo pode ter saído da lista: continua visível para não "sumir".
  const opcoes = valor && !valores.includes(valor) ? [...valores, valor] : valores;

  const [excluindo, setExcluindo] = useState<{ valor: string; uso: number } | null>(null);
  const [substituto, setSubstituto] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function pedirExclusao(v: string) {
    try {
      setExcluindo({ valor: v, uso: await usoDaOpcao(grupo, v) });
      setSubstituto('');
    } catch (e) {
      avisar('erro', (e as Error).message);
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    setOcupado(true);
    try {
      const r = await excluirOpcao(grupo, excluindo.valor, excluindo.uso > 0 ? substituto : undefined);
      if (!r.ok) {
        setExcluindo({ valor: excluindo.valor, uso: r.em_uso ?? 1 });
        return;
      }
      if (valor === excluindo.valor) aoMudar(substituto || null);
      avisar(
        'sucesso',
        r.substituidos
          ? `Opção excluída. ${r.substituidos} registro(s) passaram para ${substituto ? `"${substituto}"` : 'em branco'}.`
          : 'Opção excluída.',
      );
      setExcluindo(null);
    } catch (e) {
      avisar('erro', (e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Combo
        rotulo={rotulo}
        valor={valor}
        opcoes={opcoes}
        aoMudar={aoMudar}
        permiteLivre={permiteLivre || podeGerenciar}
        aoAdicionarOpcao={
          podeGerenciar
            ? async (novo) => {
                try {
                  const salvo = await adicionarOpcao(grupo, novo);
                  aoMudar(salvo);
                  avisar('sucesso', `"${salvo}" foi adicionada à lista e já pode ser usada por todos.`);
                } catch (e) {
                  avisar('erro', (e as Error).message);
                  throw e;
                }
              }
            : undefined
        }
        opcoesExcluiveis={podeGerenciar ? lista.filter((o) => !o.padrao).map((o) => o.valor) : undefined}
        aoExcluirOpcao={podeGerenciar ? (v) => void pedirExclusao(v) : undefined}
        placeholder={placeholder ?? 'Selecione…'}
        dica={dica}
        erro={erro}
        desabilitado={desabilitado}
        tamanho={tamanho}
        className={className}
        classeValor={classeValor}
        autoFocus={autoFocus}
      />

      <Modal
        aberto={Boolean(excluindo)}
        aoFechar={() => setExcluindo(null)}
        titulo={`Excluir a opção "${excluindo?.valor ?? ''}"`}
        largura="sm"
        rodape={
          <>
            <Botao variante="secundario" onClick={() => setExcluindo(null)} disabled={ocupado}>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={() => void confirmarExclusao()} carregando={ocupado}>
              Excluir opção
            </Botao>
          </>
        }
      >
        {excluindo && excluindo.uso > 0 ? (
          <div className="space-y-3 text-sm text-texto-suave">
            <p>
              Esta opção está em uso em <strong className="text-texto">{excluindo.uso} registro(s)</strong>. Para não
              deixá-los inconsistentes, escolha o que passa a valer neles:
            </p>
            <Selecao rotulo="Substituir por" value={substituto} onChange={(e) => setSubstituto(e.target.value)}>
              <option value="">(deixar o campo em branco)</option>
              {valores
                .filter((v) => v !== excluindo.valor)
                .map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
            </Selecao>
            <p className="text-xs text-texto-fraco">A alteração fica registrada na auditoria.</p>
          </div>
        ) : (
          <p className="text-sm text-texto-suave">
            Nenhum registro usa esta opção. Ela sai da lista para todos os usuários.
          </p>
        )}
      </Modal>
    </>
  );
}
