'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardCheck } from 'lucide-react';

import { Botao, Cartao, Selo, cn, useAvisos } from '@/components/ui';
import { TONS_SITUACAO, diasAte, formatarData, situacaoDe, textoPrazo } from '@/lib/atribuicoes';
import { rotuloPeriodicidade } from '@/lib/permissoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { AtribuicaoDoUsuario } from '@/types/banco';

/**
 * "Pelo que eu sou responsável" — o bloco que abre o dia do usuário.
 * Vem de `minhas_atribuicoes()`, que já devolve prazo e situação calculados
 * pelo banco; aqui só apresentamos e permitimos concluir o ciclo.
 */
export function MinhasAtribuicoes({
  iniciais,
  rotulosColunas,
}: {
  iniciais: AtribuicaoDoUsuario[];
  rotulosColunas: Record<string, string>;
}) {
  const { avisar } = useAvisos();
  const supabase = useMemo(() => criarClienteNavegador(), []);

  const [itens, setItens] = useState(iniciais);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function concluir(atribuicao: AtribuicaoDoUsuario) {
    setOcupado(atribuicao.id);
    try {
      const { data, error } = await supabase.rpc('concluir_atribuicao', {
        p_atribuicao: atribuicao.id,
        p_observacao: null,
      });
      if (error) throw new Error(error.message);

      const atualizada = data as unknown as { ativa: boolean; proximo_prazo: string };

      if (!atualizada.ativa) {
        setItens((atuais) => atuais.filter((a) => a.id !== atribuicao.id));
        avisar('sucesso', 'Concluída. Era uma atribuição avulsa, então foi encerrada.');
        return;
      }

      const novoPrazo = atualizada.proximo_prazo.slice(0, 10);
      const dias = diasAte(novoPrazo);
      setItens((atuais) =>
        atuais
          .map((a) =>
            a.id === atribuicao.id
              ? {
                  ...a,
                  proximo_prazo: novoPrazo,
                  dias_restantes: dias,
                  situacao: situacaoDe(dias, a.alerta_dias_antes),
                  ultima_conclusao: new Date().toISOString(),
                }
              : a,
          )
          .sort((a, b) => a.proximo_prazo.localeCompare(b.proximo_prazo)),
      );
      avisar('sucesso', `Ciclo concluído. Próximo prazo: ${formatarData(novoPrazo)}.`);
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(null);
    }
  }

  if (itens.length === 0) {
    return (
      <Cartao className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-texto">
          <ClipboardCheck className="h-4 w-4 text-marca-600" />
          Minhas responsabilidades
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-texto-suave">
          Nada sob sua responsabilidade no momento. Quando o administrador atribuir uma rotina a
          você — manter uma coluna atualizada todo mês, por exemplo — ela aparece aqui com o prazo.
        </p>
      </Cartao>
    );
  }

  const atrasadas = itens.filter((a) => a.situacao === 'atrasada').length;
  const proximas = itens.filter((a) => a.situacao === 'proxima').length;

  return (
    <Cartao>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borda px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-texto">
            <ClipboardCheck className="h-4 w-4 text-marca-600" />
            Minhas responsabilidades
          </h2>
          <p className="mt-0.5 text-xs text-texto-suave">
            {atrasadas > 0
              ? `${atrasadas} com prazo vencido — resolva primeiro.`
              : proximas > 0
                ? `${proximas} vencendo em breve.`
                : 'Tudo em dia por aqui.'}
          </p>
        </div>
        <Link
          href="/atribuicoes"
          className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:text-marca-800"
        >
          Ver todas
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ul className="divide-y divide-borda">
        {itens.map((a) => (
          <li
            key={a.id}
            className={cn(
              'flex flex-wrap items-center gap-3 px-5 py-3.5',
              a.situacao === 'atrasada' && 'bg-erro-suave/40',
            )}
          >
            <div className="min-w-[200px] flex-1">
              <p className="text-sm font-medium text-texto">{a.titulo}</p>
              {a.descricao && (
                <p className="mt-0.5 text-xs leading-snug text-texto-suave">{a.descricao}</p>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-texto-fraco">
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  {rotuloPeriodicidade(a.periodicidade)} · {formatarData(a.proximo_prazo)}
                </span>
                {a.colunas.length > 0 && (
                  <span>· {a.colunas.map((c) => rotulosColunas[c] ?? c).join(', ')}</span>
                )}
              </p>
            </div>

            <Selo tom={TONS_SITUACAO[a.situacao]}>{textoPrazo(a.dias_restantes)}</Selo>

            <Botao
              tamanho="sm"
              variante={a.situacao === 'em_dia' ? 'secundario' : 'primario'}
              carregando={ocupado === a.id}
              onClick={() => void concluir(a)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Concluir
            </Botao>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
