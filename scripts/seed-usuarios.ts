/**
 * PortalMPC — criação de usuários
 * ================================
 *
 * Cria as contas no Supabase Auth com os metadados `nome`, `area` e `role`.
 * O gatilho `handle_new_user` cuida de materializar o perfil em `profiles`.
 *
 *   npm run seed:usuarios
 *
 * Requer SUPABASE_SERVICE_ROLE_KEY no ambiente (nunca no navegador).
 * Reexecutar é seguro: usuários já existentes são apenas atualizados.
 */

import { createClient } from '@supabase/supabase-js';

import type { Area, Role } from '../src/types/banco';

interface UsuarioSemente {
  email: string;
  senha: string;
  nome: string;
  area: Area;
  role: Role;
}

/** Ajuste esta lista conforme a equipe do escritório. */
const USUARIOS: UsuarioSemente[] = [
  {
    email: 'admin@portalmpc.local',
    senha: process.env.SENHA_ADMIN ?? 'PortalMPC@2026',
    nome: 'Administrador MPC',
    area: 'administracao',
    role: 'admin',
  },
  {
    email: 'legalizacao@portalmpc.local',
    senha: process.env.SENHA_LEGALIZACAO ?? 'Legalizacao@2026',
    nome: 'Equipe Legalização',
    area: 'legalizacao',
    role: 'colaborador',
  },
  {
    email: 'gestor.legalizacao@portalmpc.local',
    senha: process.env.SENHA_GESTOR ?? 'Gestor@2026',
    nome: 'Gestor de Legalização',
    area: 'legalizacao',
    role: 'gestor',
  },
  {
    email: 'fiscal@portalmpc.local',
    senha: process.env.SENHA_FISCAL ?? 'Fiscal@2026',
    nome: 'Equipe Fiscal',
    area: 'fiscal',
    role: 'colaborador',
  },
];

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave) {
    console.error('[ERRO] Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const supabase = createClient(url, chave, { auth: { persistSession: false } });

  for (const usuario of USUARIOS) {
    const { data: existentes } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existente = existentes?.users.find((u) => u.email === usuario.email);

    const metadados = { nome: usuario.nome, area: usuario.area, role: usuario.role };

    if (existente) {
      await supabase.auth.admin.updateUserById(existente.id, {
        password: usuario.senha,
        user_metadata: metadados,
      });
      // O gatilho só roda na criação; garante o perfil também nas atualizações.
      await supabase
        .from('profiles')
        .upsert(
          { id: existente.id, email: usuario.email, ...metadados, ativo: true },
          { onConflict: 'id' },
        );
      console.log(`atualizado  ${usuario.email}  (${usuario.role}/${usuario.area})`);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: usuario.email,
      password: usuario.senha,
      email_confirm: true,
      user_metadata: metadados,
    });

    if (error) {
      console.error(`falhou      ${usuario.email}: ${error.message}`);
      continue;
    }

    await supabase
      .from('profiles')
      .upsert({ id: data.user.id, email: usuario.email, ...metadados, ativo: true }, { onConflict: 'id' });

    console.log(`criado      ${usuario.email}  (${usuario.role}/${usuario.area})`);
  }

  console.log('\nConcluído. Troque as senhas no primeiro acesso.');
}

main().catch((erro) => {
  console.error('[FALHA]', erro);
  process.exit(1);
});
