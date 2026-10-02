import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@supabase/supabase-js';

import { PERMISSOES_SOMENTE_ADMIN, ehAdmin, podeGerenciarUsuarios } from '@/lib/permissoes';
import { criarClienteServidor, obterPerfilAtual } from '@/lib/supabase/server';
import type { Area, Role } from '@/types/banco';

export const runtime = 'nodejs';

/**
 * Criação de usuários pela interface.
 *
 * Criar uma conta no Supabase Auth exige a `service_role`, que jamais pode ir
 * para o navegador. Por isso a operação vive aqui: o cliente pede, este
 * handler confere a permissão de quem pediu e só então usa a chave — que
 * nunca sai do servidor.
 */

function clienteAdministrativo() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { persistSession: false } });
}

interface CorpoNovoUsuario {
  nome?: string;
  email?: string;
  senha?: string;
  area?: Area;
  role?: Role;
  permissoes?: string[];
  colunas?: string[];
}

export async function POST(request: NextRequest) {
  const solicitante = await obterPerfilAtual();

  if (!solicitante) {
    return NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 });
  }
  if (!podeGerenciarUsuarios(solicitante)) {
    return NextResponse.json({ erro: 'Você não tem permissão para criar usuários.' }, { status: 403 });
  }

  const admin = clienteAdministrativo();
  if (!admin) {
    return NextResponse.json(
      {
        erro:
          'SUPABASE_SERVICE_ROLE_KEY não está configurada no servidor. ' +
          'Adicione-a ao .env.local e reinicie o portal.',
      },
      { status: 503 },
    );
  }

  const corpo = (await request.json().catch(() => ({}))) as CorpoNovoUsuario;

  const nome = (corpo.nome ?? '').trim();
  const email = (corpo.email ?? '').trim().toLowerCase();
  const senha = corpo.senha ?? '';
  const area: Area = corpo.area ?? 'legalizacao';
  const role: Role = corpo.role ?? 'colaborador';

  if (nome.length < 3) return NextResponse.json({ erro: 'Informe o nome completo.' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ erro: 'E-mail inválido.' }, { status: 400 });
  }
  if (senha.length < 8) {
    return NextResponse.json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, { status: 400 });
  }
  // Só um admin cria outro admin.
  if (role === 'admin' && !ehAdmin(solicitante)) {
    return NextResponse.json(
      { erro: 'Apenas administradores podem criar outro administrador.' },
      { status: 403 },
    );
  }

  // Permissões confidenciais nunca vão para quem não é admin — mesmo que o
  // cliente as envie no corpo da requisição.
  const permissoes = (corpo.permissoes ?? []).filter(
    (chave) => role === 'admin' || !PERMISSOES_SOMENTE_ADMIN.includes(chave),
  );

  const { data: criado, error: erroCriacao } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome, area, role },
  });

  if (erroCriacao) {
    const jaExiste = erroCriacao.message.toLowerCase().includes('already');
    return NextResponse.json(
      { erro: jaExiste ? 'Já existe um usuário com este e-mail.' : erroCriacao.message },
      { status: jaExiste ? 409 : 500 },
    );
  }

  const usuarioId = criado.user.id;

  // O gatilho handle_new_user já cria o profile; o upsert garante os valores
  // mesmo que o gatilho não esteja instalado.
  const { error: erroPerfil } = await admin
    .from('profiles')
    .upsert({ id: usuarioId, nome, email, area, role, ativo: true }, { onConflict: 'id' });

  if (erroPerfil) {
    await admin.auth.admin.deleteUser(usuarioId);
    return NextResponse.json({ erro: `Falha ao criar o perfil: ${erroPerfil.message}` }, { status: 500 });
  }

  if (permissoes.length > 0) {
    const { error } = await admin.from('usuario_permissoes').insert(
      permissoes.map((chave) => ({ usuario_id: usuarioId, chave, concedido_por: solicitante.id })),
    );
    if (error) {
      return NextResponse.json(
        { erro: `Usuário criado, mas as permissões falharam: ${error.message}`, id: usuarioId },
        { status: 207 },
      );
    }
  }

  if ((corpo.colunas ?? []).length > 0) {
    await admin.from('usuario_colunas').insert(
      corpo.colunas!.map((coluna) => ({
        usuario_id: usuarioId,
        tabela: 'legalizacao_empresas',
        coluna,
      })),
    );
  }

  // Registra na auditoria sob a identidade de quem pediu.
  const supabase = await criarClienteServidor();
  await supabase.rpc('registrar_evento_auditoria', {
    p_acao: 'INSERT',
    p_tabela: 'profiles',
    p_registro_id: usuarioId,
    p_contexto: { origem: 'painel de usuários', permissoes_concedidas: permissoes.length },
    p_dados_novos: { nome, email, area, role },
  });

  return NextResponse.json({ ok: true, id: usuarioId, nome, email, area, role });
}

/** Redefinição de senha feita pelo administrador. */
export async function PATCH(request: NextRequest) {
  const solicitante = await obterPerfilAtual();

  if (!solicitante) return NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 });
  if (!podeGerenciarUsuarios(solicitante)) {
    return NextResponse.json({ erro: 'Sem permissão.' }, { status: 403 });
  }

  const admin = clienteAdministrativo();
  if (!admin) {
    return NextResponse.json(
      { erro: 'SUPABASE_SERVICE_ROLE_KEY não está configurada no servidor.' },
      { status: 503 },
    );
  }

  const { usuarioId, novaSenha } = (await request.json().catch(() => ({}))) as {
    usuarioId?: string;
    novaSenha?: string;
  };

  if (!usuarioId || !novaSenha || novaSenha.length < 8) {
    return NextResponse.json(
      { erro: 'Informe o usuário e uma senha com pelo menos 8 caracteres.' },
      { status: 400 },
    );
  }

  const { error } = await admin.auth.admin.updateUserById(usuarioId, { password: novaSenha });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const supabase = await criarClienteServidor();
  await supabase.rpc('registrar_evento_auditoria', {
    p_acao: 'UPDATE',
    p_tabela: 'profiles',
    p_registro_id: usuarioId,
    p_contexto: { origem: 'painel de usuários', acao: 'senha redefinida pelo administrador' },
    p_dados_novos: null,
  });

  return NextResponse.json({ ok: true });
}
