'use client';

import { useMemo, useState, type FormEvent } from 'react';

import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';

import { Botao, Campo, useAvisos } from '@/components/ui';
import { mascararTelefone } from '@/lib/mascaras';
import { normalizarTelefone } from '@/lib/normalizacao';
import { criarClienteNavegador } from '@/lib/supabase/client';
import type { Perfil } from '@/types/banco';

export function FormularioPerfil({ perfil }: { perfil: Perfil }) {
  const router = useRouter();
  const { avisar } = useAvisos();
  const supabase = useMemo(() => criarClienteNavegador(), []);

  const [nome, setNome] = useState(perfil.nome);
  const [telefone, setTelefone] = useState(mascararTelefone(perfil.telefone ?? ''));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (nome.trim().length < 3) {
      setErro('Informe seu nome completo.');
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ nome: nome.trim(), telefone: normalizarTelefone(telefone) })
        .eq('id', perfil.id);

      if (error) throw new Error(error.message);

      avisar('sucesso', 'Perfil atualizado.');
      router.refresh();
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4" noValidate>
      <Campo
        rotulo="Nome completo"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        erro={erro ?? undefined}
        disabled={salvando}
        required
      />
      <Campo
        rotulo="Telefone"
        value={telefone}
        onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
        placeholder="(11) 99999-9999"
        disabled={salvando}
      />
      <Botao type="submit" carregando={salvando}>
        <Save className="h-4 w-4" />
        Salvar alterações
      </Botao>
    </form>
  );
}
