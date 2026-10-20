'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Camera, Heart, MessageSquareReply, Newspaper, Pencil, Image as ImageIcon } from 'lucide-react';

import { BotaoSeguir, SininhoPerfil } from '@/components/forum/BotaoSeguir';
import { LateralForum } from '@/components/forum/LateralForum';
import { ListaPosts, type ModoLista } from '@/components/forum/ListaPosts';
import { Avatar, ProvedorForum, useForum, type EuNoForum } from '@/components/forum/comum';
import { AreaTexto, Botao, Campo, Modal, Selo, cn, useAvisos } from '@/components/ui';
import { CORES_CAPA, corDaPessoa, enviarImagem } from '@/lib/forum';
import { rotuloArea } from '@/lib/permissoes';
import type { PerfilForum } from '@/types/banco';

const ABAS: { valor: ModoLista; rotulo: string; icone: typeof Newspaper }[] = [
  { valor: 'perfil', rotulo: 'Posts', icone: Newspaper },
  { valor: 'respostas', rotulo: 'Respostas', icone: MessageSquareReply },
  { valor: 'midia', rotulo: 'Fotos', icone: ImageIcon },
  { valor: 'curtidas', rotulo: 'Curtidas', icone: Heart },
];

export function PerfilTela({ eu, usuarioId }: { eu: EuNoForum; usuarioId: string }) {
  return (
    <ProvedorForum eu={eu}>
      <div className="mx-auto grid max-w-6xl gap-6 px-0 sm:px-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:py-5">
        <Perfil usuarioId={usuarioId} />
        <div className="hidden lg:block">
          <div className="sticky top-20">
            <LateralForum />
          </div>
        </div>
      </div>
    </ProvedorForum>
  );
}

function Perfil({ usuarioId }: { usuarioId: string }) {
  const { supabase, eu, carregarUrls, urls } = useForum();
  const router = useRouter();
  const [perfil, setPerfil] = useState<PerfilForum | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [aba, setAba] = useState<ModoLista>('perfil');
  const [editando, setEditando] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc('forum_perfil', { p_usuario: usuarioId });
    const p = data as PerfilForum | null;
    setPerfil(p);
    if (p?.avatar_path) void carregarUrls([p.avatar_path]);
    setCarregado(true);
  }, [supabase, usuarioId, carregarUrls]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!carregado) {
    return <main className="h-96 animate-pulse border-borda bg-superficie-elevada sm:rounded-2xl sm:border" />;
  }
  if (!perfil) {
    return (
      <main className="border-borda bg-superficie-elevada px-6 py-14 text-center sm:rounded-2xl sm:border">
        <p className="text-lg font-bold text-texto">Perfil não encontrado</p>
        <p className="text-sm text-texto-suave">A pessoa pode ter saído da equipe.</p>
      </main>
    );
  }

  const sou = perfil.id === eu.id;
  const capa = perfil.capa_cor || corDaPessoa(perfil.id);

  return (
    <main className="min-w-0 border-borda bg-superficie-elevada sm:rounded-2xl sm:border">
      <div className="sticky top-14 z-10 flex items-center gap-4 border-b border-borda bg-superficie-elevada/95 px-4 py-2 backdrop-blur sm:rounded-t-2xl">
        <button onClick={() => router.push('/forum')} className="rounded-full p-2 hover:bg-superficie" aria-label="Voltar ao Fórum">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold leading-tight text-texto">{perfil.nome}</h1>
          <p className="text-xs text-texto-fraco">{perfil.posts} post{perfil.posts === 1 ? '' : 's'}</p>
        </div>
      </div>

      <div className="h-36" style={{ background: `linear-gradient(135deg, ${capa}, ${capa}cc 60%, #1f2937)` }} />
      <div className="px-4">
        <div className="-mt-14 flex items-end justify-between">
          <div className="rounded-full ring-4 ring-superficie-elevada">
            <Avatar pessoa={perfil} tamanho="xl" />
          </div>
          <div className="mb-1 flex items-center gap-2">
            {sou ? (
              <Botao variante="secundario" className="rounded-full" onClick={() => setEditando(true)}>
                <Pencil className="h-4 w-4" /> Editar perfil
              </Botao>
            ) : (
              <>
                {perfil.eu_sigo && <SininhoPerfil pessoaId={perfil.id} ligado={perfil.sininho} aoMudar={(sininho) => setPerfil({ ...perfil, sininho })} />}
                <BotaoSeguir
                  pessoaId={perfil.id}
                  sigo={perfil.eu_sigo}
                  aoMudar={(sigo) => setPerfil({ ...perfil, eu_sigo: sigo, sininho: sigo, seguidores: perfil.seguidores + (sigo ? 1 : -1) })}
                />
              </>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-2 pb-3">
          <div>
            <h2 className="text-xl font-bold text-texto">{perfil.nome}</h2>
            <p className="flex flex-wrap items-center gap-2 text-sm text-texto-fraco">
              @{perfil.apelido}
              {perfil.me_segue && !sou && <Selo className="text-[10px]">segue você</Selo>}
            </p>
          </div>
          {perfil.bio && <p className="whitespace-pre-wrap text-[15px] text-texto">{perfil.bio}</p>}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-texto-suave">
            {perfil.cargo && <span>{perfil.cargo}</span>}
            {perfil.area && <Selo tom="marca">{rotuloArea(perfil.area)}</Selo>}
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-4 w-4" />
              No portal desde {new Date(perfil.desde).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
          </p>
          <p className="flex flex-wrap gap-4 text-sm">
            <span>
              <strong className="text-texto">{perfil.seguindo}</strong> <span className="text-texto-suave">seguindo</span>
            </span>
            <span>
              <strong className="text-texto">{perfil.seguidores}</strong> <span className="text-texto-suave">seguidor{perfil.seguidores === 1 ? '' : 'es'}</span>
            </span>
            <span>
              <strong className="text-texto">{perfil.curtidas_recebidas}</strong> <span className="text-texto-suave">curtidas recebidas</span>
            </span>
          </p>
          {!sou && perfil.eu_sigo && (
            <p className="text-xs text-texto-fraco">
              {perfil.sininho ? '🔔 Você é avisado a cada post novo.' : 'O sininho está desligado: os posts só aparecem no seu “Seguindo”.'}
            </p>
          )}
        </div>
      </div>

      <nav className="flex border-b border-borda" aria-label="Abas do perfil">
        {ABAS.map((a) => (
          <button
            key={a.valor}
            onClick={() => setAba(a.valor)}
            className={cn('relative flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium hover:bg-superficie', aba === a.valor ? 'text-texto' : 'text-texto-suave')}
          >
            <a.icone className="h-4 w-4" />
            {a.rotulo}
            {aba === a.valor && <span className="absolute bottom-0 h-1 w-12 rounded-full bg-marca-600" />}
          </button>
        ))}
      </nav>

      <ListaPosts
        modo={aba}
        autor={perfil.id}
        vazio={
          <p className="text-sm text-texto-suave">
            {aba === 'perfil'
              ? sou
                ? 'Você ainda não postou. Que tal começar?'
                : `${perfil.nome.split(' ')[0]} ainda não postou.`
              : aba === 'respostas'
                ? 'Nenhuma resposta.'
                : aba === 'midia'
                  ? 'Nenhuma foto.'
                  : 'Nenhuma curtida ainda.'}
          </p>
        }
      />

      {sou && (
        <EditarPerfil
          aberto={editando}
          aoFechar={() => setEditando(false)}
          perfil={perfil}
          urlAvatar={perfil.avatar_path ? urls[perfil.avatar_path] : null}
          aoSalvar={() => {
            setEditando(false);
            void carregar();
            router.refresh();
          }}
        />
      )}
    </main>
  );
}

function EditarPerfil({
  aberto,
  aoFechar,
  perfil,
  urlAvatar,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  perfil: PerfilForum;
  urlAvatar: string | null;
  aoSalvar: () => void;
}) {
  const { supabase, eu } = useForum();
  const { avisar } = useAvisos();
  const [apelido, setApelido] = useState(perfil.apelido ?? '');
  const [cargo, setCargo] = useState(perfil.cargo ?? '');
  const [bio, setBio] = useState(perfil.bio ?? '');
  const [capa, setCapa] = useState(perfil.capa_cor ?? '');
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [removerFoto, setRemoverFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setApelido(perfil.apelido ?? '');
    setCargo(perfil.cargo ?? '');
    setBio(perfil.bio ?? '');
    setCapa(perfil.capa_cor ?? '');
    setFoto(null);
    setPrevia(null);
    setRemoverFoto(false);
  }, [aberto, perfil]);

  async function salvar() {
    const novoApelido = apelido.trim().toLowerCase().replace(/^@/, '');
    if (!/^[a-z0-9._]{3,30}$/.test(novoApelido)) {
      avisar('alerta', 'O @apelido precisa ter de 3 a 30 letras minúsculas, números, ponto ou sublinhado.');
      return;
    }
    setSalvando(true);
    try {
      let avatar = removerFoto ? null : perfil.avatar_path;
      if (foto) avatar = await enviarImagem(supabase, eu.id, 'avatares', foto);
      const { error } = await supabase
        .from('profiles')
        .update({ apelido: novoApelido, cargo: cargo.trim() || null, bio: bio.trim() || null, capa_cor: capa || null, avatar_path: avatar })
        .eq('id', eu.id);
      if (error) {
        throw new Error(error.code === '23505' ? 'Esse @apelido já é de outra pessoa.' : error.message);
      }
      if ((foto || removerFoto) && perfil.avatar_path) await supabase.storage.from('portal').remove([perfil.avatar_path]);
      avisar('sucesso', 'Perfil atualizado.');
      aoSalvar();
    } catch (e) {
      avisar('erro', e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  const imagem = previa ?? (removerFoto ? null : urlAvatar);

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Editar perfil"
      rodape={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={() => void salvar()} carregando={salvando}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => seletor.current?.click()} className="group relative h-20 w-20 overflow-hidden rounded-full" aria-label="Trocar foto">
            {imagem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagem} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white" style={{ background: corDaPessoa(perfil.id) }}>
                {perfil.nome[0]}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5" />
            </span>
          </button>
          <div className="space-y-1 text-sm">
            <button type="button" onClick={() => seletor.current?.click()} className="block font-medium text-marca-700 hover:underline">
              Escolher foto
            </button>
            {(perfil.avatar_path || foto) && (
              <button
                type="button"
                onClick={() => {
                  setFoto(null);
                  setPrevia(null);
                  setRemoverFoto(true);
                }}
                className="block text-erro hover:underline"
              >
                Remover foto
              </button>
            )}
          </div>
          <input
            ref={seletor}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (!arquivo) return;
              setFoto(arquivo);
              setPrevia(URL.createObjectURL(arquivo));
              setRemoverFoto(false);
            }}
          />
        </div>
        <Campo rotulo="@apelido (para ser mencionado)" value={apelido} onChange={(e) => setApelido(e.target.value)} maxLength={31} />
        <Campo rotulo="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Analista de Legalização" maxLength={80} />
        <div>
          <AreaTexto rotulo="Bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} placeholder="Conte um pouco sobre você" />
          <p className="mt-1 text-right text-[11px] text-texto-fraco">{bio.length}/280</p>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-texto-suave">Cor da capa</p>
          <div className="flex flex-wrap gap-2">
            {CORES_CAPA.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCapa(c)}
                className={cn('h-8 w-8 rounded-full ring-offset-2 transition-transform hover:scale-110', capa === c && 'ring-2 ring-texto')}
                style={{ background: c }}
                aria-label={`Capa ${c}`}
              />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
