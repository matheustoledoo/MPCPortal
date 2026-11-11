import { redirect } from 'next/navigation';

import { CalendarioApp, type PessoaCalendario } from '@/app/(portal)/calendario/CalendarioApp';
import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { DEPARTAMENTO_DA_AREA, departamentoDoSlug } from '@/lib/calendario';
import { PERMISSOES, pode } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { Departamento, EventoCalendario, RegraCalendario } from '@/types/banco';

export const metadata = { title: 'Calendário' };

type Aba = 'painel' | 'cal' | 'semana' | 'dia' | 'lista' | 'regras';
const ABAS: Aba[] = ['painel', 'cal', 'semana', 'dia', 'lista', 'regras'];

/**
 * Calendário de Obrigações. A RLS decide o que chega: quem não tem
 * "todos os departamentos" recebe só o próprio departamento e o que foi
 * marcado como "também aparece para" ele.
 *
 * Aceita os links do app antigo e das notificações:
 * `?d=fiscal` (departamento), `?data=2026-10-20`, `?item=<chave>`, `?aba=lista`.
 */
export default async function PaginaCalendario({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; data?: string; item?: string; aba?: string }>;
}) {
  const perfil = await obterPerfilAtual();
  if (!perfil) redirect('/login');
  if (!pode(perfil, PERMISSOES.telaCalendario)) redirect('/sem-acesso');

  const parametros = await searchParams;
  const supabase = await criarClienteServidor();
  const [{ data: regras }, { data: eventos }, { data: perfis }] = await Promise.all([
    supabase.from('calendario_regras').select('*').order('nome'),
    supabase.from('calendario_eventos').select('*').order('data'),
    supabase.from('profiles').select('id, nome, area').eq('ativo', true).order('nome'),
  ]);

  const todos = pode(perfil, PERMISSOES.calendarioTodos);
  const meuDepartamento: Departamento = DEPARTAMENTO_DA_AREA[perfil.area ?? ''] ?? 'Matriz';
  const pessoas: PessoaCalendario[] = ((perfis ?? []) as { id: string; nome: string; area: string | null }[]).map((p) => ({
    id: p.id,
    nome: p.nome,
    departamento: DEPARTAMENTO_DA_AREA[p.area ?? ''] ?? 'Matriz',
  }));

  const dept = departamentoDoSlug(parametros.d);
  const aba = ABAS.includes(parametros.aba as Aba) ? (parametros.aba as Aba) : undefined;
  const data = /^\d{4}-\d{2}-\d{2}$/.test(parametros.data ?? '') ? parametros.data : parametros.item?.split(':').pop();

  return (
    <>
      <CabecalhoPagina
        titulo="Calendário"
        descricao={
          todos
            ? 'A agenda central do escritório: obrigações do e-Conet, compromissos, tarefas, prazos da legalização, integrações e ações de prospecção — por dia, semana ou mês.'
            : `Sua agenda e a de ${meuDepartamento}: obrigações, tarefas, prazos e reuniões em um só lugar.`
        }
      />
      <div className="p-5 sm:p-7">
        <CalendarioApp
          meuId={perfil.id}
          meuNome={perfil.nome}
          permissoes={{
            todos,
            gerencia: pode(perfil, PERMISSOES.gerenciarCalendario),
            meuDepartamento,
            podeIntegracao: pode(perfil, PERMISSOES.telaIntegracao),
          }}
          regrasIniciais={(regras ?? []) as RegraCalendario[]}
          eventosIniciais={(eventos ?? []) as EventoCalendario[]}
          pessoas={pessoas}
          inicial={{
            data: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : undefined,
            item: parametros.item,
            dept: todos ? dept : null,
            aba,
          }}
        />
      </div>
    </>
  );
}
