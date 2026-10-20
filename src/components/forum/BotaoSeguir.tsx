'use client';

import { useState } from 'react';

import { BellOff, BellRing } from 'lucide-react';

import { useForum } from '@/components/forum/comum';
import { cn, useAvisos } from '@/components/ui';

/** Seguir / deixar de seguir. Ao seguir, o sininho já começa ligado. */
export function BotaoSeguir({
  pessoaId,
  sigo,
  aoMudar,
  compacto = false,
}: {
  pessoaId: string;
  sigo: boolean;
  aoMudar: (sigo: boolean) => void;
  compacto?: boolean;
}) {
  const { supabase, eu } = useForum();
  const { avisar } = useAvisos();
  const [ocupado, setOcupado] = useState(false);
  const [sobre, setSobre] = useState(false);

  if (pessoaId === eu.id) return null;

  async function alternar() {
    setOcupado(true);
    const { error } = sigo
      ? await supabase.from('forum_seguidores').delete().eq('seguidor_id', eu.id).eq('seguido_id', pessoaId)
      : await supabase.from('forum_seguidores').insert({ seguido_id: pessoaId, notificar: true });
    setOcupado(false);
    if (error && error.code !== '23505') {
      avisar('erro', error.message);
      return;
    }
    aoMudar(!sigo);
    if (!sigo) avisar('sucesso', 'Seguindo! O sininho está ligado: você recebe cada post novo.');
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void alternar();
      }}
      onMouseEnter={() => setSobre(true)}
      onMouseLeave={() => setSobre(false)}
      disabled={ocupado}
      className={cn(
        'shrink-0 rounded-full font-semibold transition-colors disabled:opacity-60',
        compacto ? 'h-8 px-3.5 text-xs' : 'h-9 px-5 text-sm',
        sigo
          ? 'border border-borda-forte bg-white text-texto hover:border-red-300 hover:bg-erro-suave hover:text-erro'
          : 'bg-texto text-white hover:bg-grafite-700',
      )}
    >
      {sigo ? (sobre ? 'Deixar de seguir' : 'Seguindo') : 'Seguir'}
    </button>
  );
}

/** O sininho do perfil: receber (ou não) cada post novo da pessoa. */
export function SininhoPerfil({
  pessoaId,
  ligado,
  aoMudar,
}: {
  pessoaId: string;
  ligado: boolean;
  aoMudar: (ligado: boolean) => void;
}) {
  const { supabase, eu } = useForum();
  const { avisar } = useAvisos();

  async function alternar() {
    const { error } = await supabase.from('forum_seguidores').update({ notificar: !ligado }).eq('seguidor_id', eu.id).eq('seguido_id', pessoaId);
    if (error) {
      avisar('erro', error.message);
      return;
    }
    aoMudar(!ligado);
    avisar('sucesso', ligado ? 'Sininho desligado: os posts continuam no seu "Seguindo".' : 'Sininho ligado: você é avisado a cada post novo.');
  }

  return (
    <button
      onClick={() => void alternar()}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full border transition-colors',
        ligado ? 'border-marca-300 bg-marca-50 text-marca-700' : 'border-borda-forte text-texto-suave hover:bg-superficie',
      )}
      title={ligado ? 'Você recebe notificação a cada post. Clique para desligar.' : 'Ligar o sininho: receber notificação a cada post.'}
      aria-label={ligado ? 'Desligar notificações desta pessoa' : 'Ligar notificações desta pessoa'}
    >
      {ligado ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
    </button>
  );
}

