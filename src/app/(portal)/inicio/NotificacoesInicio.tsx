'use client';

import { useMemo, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bell } from 'lucide-react';

import { EVENTO_NOTIFICACOES, ItemNotificacao } from '@/components/layout/SinoNotificacoes';
import { Cartao, CabecalhoCartao, useAvisos } from '@/components/ui';
import { concluirOrigem, marcarNotificacoes } from '@/lib/notificacoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { Notificacao } from '@/types/banco';

/** As notificações pendentes, com concluir/fechar ali mesmo. */
export function NotificacoesInicio({
  iniciais,
  usuarioId,
  nome,
}: {
  iniciais: Notificacao[];
  usuarioId: string;
  nome: string;
}) {
  const supabase = useMemo(() => criarClienteNavegador(), []);
  const router = useRouter();
  const { avisar } = useAvisos();
  const [lista, setLista] = useState(iniciais);

  async function agir(n: Notificacao, acao: 'lida' | 'arquivar' | 'concluir') {
    setLista((atual) => (acao === 'lida' ? atual.map((x) => (x.id === n.id ? { ...x, lida_em: new Date().toISOString() } : x)) : atual.filter((x) => x.id !== n.id)));
    try {
      if (acao === 'concluir') {
        await concluirOrigem(supabase, n, nome, usuarioId);
        avisar('sucesso', 'Concluída.');
      } else await marcarNotificacoes(supabase, [n.id], acao);
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível atualizar.');
    } finally {
      window.dispatchEvent(new Event(EVENTO_NOTIFICACOES + ':recarregar'));
    }
  }

  return (
    <Cartao>
      <CabecalhoCartao
        titulo={
          <span className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-marca-600" /> Minhas notificações
          </span>
        }
        descricao="Pendências, designações e o que aconteceu no Fórum."
        acoes={
          <Link href="/notificacoes" className="inline-flex items-center gap-1 text-xs font-medium text-marca-700 hover:underline">
            Ver todas <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />
      {lista.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-texto-suave">Nada pendente. Bom trabalho!</p>
      ) : (
        <ul className="divide-y divide-borda">
          {lista.slice(0, 7).map((n) => (
            <ItemNotificacao
              key={n.id}
              n={n}
              compacto
              aoAbrir={() => {
                if (!n.lida_em) void agir(n, 'lida');
                if (n.link) router.push(n.link);
              }}
              aoAgir={(acao) => void agir(n, acao)}
            />
          ))}
        </ul>
      )}
    </Cartao>
  );
}
