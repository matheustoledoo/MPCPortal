'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { Lock, ShieldCheck, Sparkles } from 'lucide-react';

import { Botao, Campo, Selecao, cn, useAvisos } from '@/components/ui';
import { AREAS, PERMISSOES, ROLES } from '@/lib/permissoes';
import type { Area, PermissaoCatalogo, Perfil, Role } from '@/types/banco';

/**
 * Criação de usuário pelo administrador.
 *
 * A conta em si nasce no servidor (`/api/admin/usuarios`), porque criar
 * usuário no Supabase Auth exige a `service_role` — que jamais pode chegar
 * ao navegador. Aqui só montamos o pedido e mostramos o resultado.
 */

const TITULOS_GRUPO: Record<string, string> = {
  telas: 'Telas que poderá abrir',
  dados: 'O que poderá fazer com os dados',
  administracao: 'Administração',
};

/**
 * Sugestão inicial de permissões por time. É apenas um ponto de partida —
 * tudo continua editável nos checkboxes antes de salvar e depois na tela de
 * permissões.
 */
function sugestaoPara(area: Area, role: Role): string[] {
  const comuns = [PERMISSOES.telaInicio as string, PERMISSOES.telaAtribuicoes as string];

  const porArea: Record<Area, string[]> = {
    legalizacao: [
      PERMISSOES.telaLegalizacao,
      PERMISSOES.telaReferencias,
      PERMISSOES.editarEmpresas,
      PERMISSOES.exportarLegalizacao,
    ],
    fiscal: [PERMISSOES.telaFiscal],
    contabil: [PERMISSOES.telaContabil],
    departamento_pessoal: [PERMISSOES.telaDp],
    administracao: [PERMISSOES.telaDashboard],
  };

  const porRole: string[] =
    role === 'gestor'
      ? [PERMISSOES.telaDashboard, PERMISSOES.criarEmpresas, PERMISSOES.gerenciarAtribuicoes]
      : [];

  return Array.from(new Set([...comuns, ...porArea[area], ...porRole]));
}

interface Resposta {
  ok?: boolean;
  id?: string;
  erro?: string;
}

export function FormularioNovoUsuario({
  catalogo,
  souAdmin,
  aoCriar,
}: {
  catalogo: PermissaoCatalogo[];
  souAdmin: boolean;
  aoCriar: (novo: { perfil: Perfil; permissoes: string[] }) => void;
}) {
  const { avisar } = useAvisos();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [area, setArea] = useState<Area>('legalizacao');
  const [role, setRole] = useState<Role>('colaborador');
  const [marcadas, setMarcadas] = useState<string[]>(() => sugestaoPara('legalizacao', 'colaborador'));
  const [tocouPermissoes, setTocouPermissoes] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Enquanto o admin não mexe nos checkboxes, trocar o time reajusta a
  // sugestão. Depois do primeiro clique manual, respeitamos a escolha dele.
  useEffect(() => {
    if (tocouPermissoes) return;
    setMarcadas(sugestaoPara(area, role));
  }, [area, role, tocouPermissoes]);

  function alternar(chave: string, marcar: boolean) {
    setTocouPermissoes(true);
    setMarcadas((atuais) =>
      marcar ? Array.from(new Set([...atuais, chave])) : atuais.filter((c) => c !== chave),
    );
  }

  function gerarSenha() {
    // Sem `Math.random` decorativo: usamos a fonte criptográfica do navegador.
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%';
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    setSenha(Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join(''));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (nome.trim().length < 3) return setErro('Informe o nome completo.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErro('E-mail inválido.');
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');

    setEnviando(true);
    try {
      const resposta = await fetch('/api/admin/usuarios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          senha,
          area,
          role,
          // Admin recebe tudo pelo próprio papel; não faz sentido gravar linhas.
          permissoes: role === 'admin' ? [] : marcadas,
        }),
      });

      const corpo = (await resposta.json().catch(() => ({}))) as Resposta;
      if (!resposta.ok || !corpo.id) {
        throw new Error(corpo.erro ?? 'Não foi possível criar o usuário.');
      }

      const agora = new Date().toISOString();
      const perfil: Perfil = {
        id: corpo.id,
        nome: nome.trim(),
        email: email.trim().toLowerCase(),
        area,
        role,
        ativo: true,
        telefone: null,
        ultimo_acesso: null,
        created_at: agora,
        updated_at: agora,
      };

      avisar('sucesso', `${perfil.nome} criado. Entregue a senha em um canal seguro.`);
      aoCriar({ perfil, permissoes: role === 'admin' ? [] : marcadas });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : 'Falha inesperada ao criar o usuário.';
      setErro(mensagem);
    } finally {
      setEnviando(false);
    }
  }

  const grupos = ['telas', 'dados', 'administracao'] as const;

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          rotulo="Nome completo"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Maria Silva"
          autoComplete="off"
          required
        />
        <Campo
          rotulo="E-mail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="maria@metaplanocontabil.com.br"
          autoComplete="off"
          required
        />
      </div>

      <div>
        <div className="flex items-end gap-2">
          <Campo
            rotulo="Senha inicial"
            type="text"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="mínimo de 8 caracteres"
            autoComplete="new-password"
            dica="Anote antes de salvar: ela não é exibida novamente."
            required
          />
          <Botao type="button" variante="secundario" onClick={gerarSenha} className="mb-6 shrink-0">
            <Sparkles className="h-3.5 w-3.5" />
            Gerar
          </Botao>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Selecao
          rotulo="Time"
          value={area}
          onChange={(e) => setArea(e.target.value as Area)}
        >
          {AREAS.map((a) => (
            <option key={a.valor} value={a.valor}>
              {a.rotulo}
            </option>
          ))}
        </Selecao>

        <Selecao rotulo="Função" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r.valor} value={r.valor} disabled={r.valor === 'admin' && !souAdmin}>
              {r.rotulo}
            </option>
          ))}
        </Selecao>
      </div>

      <p className="text-xs leading-relaxed text-texto-suave">
        {ROLES.find((r) => r.valor === role)?.descricao}
      </p>

      {role === 'admin' ? (
        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-alerta-suave px-3.5 py-3 text-xs leading-relaxed text-alerta">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Administrador tem acesso irrestrito</strong> — todas as telas, inclusive a
            planilha ADM com honorários, a auditoria e as configurações. Marcar permissões é
            desnecessário para este papel.
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-texto">Permissões iniciais</p>
              <p className="text-xs text-texto-suave">
                Sugerimos pelo time escolhido. Ajuste como quiser — dá para mudar depois a qualquer
                momento.
              </p>
            </div>
            <Botao
              type="button"
              variante="fantasma"
              tamanho="sm"
              onClick={() => {
                setTocouPermissoes(false);
                setMarcadas(sugestaoPara(area, role));
              }}
            >
              Restaurar sugestão
            </Botao>
          </div>

          {grupos.map((grupo) => {
            // Permissões confidenciais nem aparecem para quem não é admin:
            // o banco recusaria, e a tela não deve prometer o que não entrega.
            const itens = catalogo.filter((c) => c.grupo === grupo && !c.somente_admin);
            if (itens.length === 0) return null;

            return (
              <div key={grupo}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">
                  {TITULOS_GRUPO[grupo] ?? grupo}
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {itens.map((item) => {
                    const marcado = marcadas.includes(item.chave);
                    return (
                      <label
                        key={item.chave}
                        title={item.descricao ?? undefined}
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors',
                          marcado ? 'border-marca-200 bg-marca-50' : 'border-borda hover:bg-superficie',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={(e) => alternar(item.chave, e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-borda-forte text-marca-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-texto">{item.rotulo}</span>
                          {item.descricao && (
                            <span className="mt-0.5 block text-[11px] leading-snug text-texto-suave">
                              {item.descricao}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <p className="flex items-start gap-2 rounded-lg border border-borda bg-superficie px-3.5 py-2.5 text-[11px] leading-relaxed text-texto-suave">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-alerta" />
            <span>
              Telas e dados restritos ao administrador (planilha ADM, auditoria e configurações) não
              aparecem nesta lista e não podem ser concedidos a outros papéis — a regra é aplicada
              também no banco de dados.
            </span>
          </p>
        </div>
      )}

      {erro && (
        <div
          role="alert"
          className="animar-surgir rounded-lg border border-red-200 bg-erro-suave px-3.5 py-2.5 text-sm text-erro"
        >
          {erro}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-borda pt-4">
        <Botao type="submit" carregando={enviando}>
          Criar usuário
        </Botao>
      </div>
    </form>
  );
}
