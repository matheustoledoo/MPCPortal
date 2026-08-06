/**
 * Junta migrations em um único arquivo para colar no SQL Editor do Supabase.
 *
 * Existe porque nem sempre há acesso direto ao banco a partir da máquina que
 * escreve o código. O arquivo gerado é idempotente: cada migration usa
 * `create or replace`, `if not exists` e `drop policy if exists`, então rodar
 * duas vezes não quebra nada.
 *
 *   npm run migrations:juntar            # da 0010 em diante (padrão)
 *   npm run migrations:juntar -- 0001    # tudo, desde o começo
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PASTA = join(process.cwd(), 'supabase', 'migrations');
const SAIDA = join(process.cwd(), 'supabase', 'APLICAR_NO_SQL_EDITOR.sql');

const apartirDe = process.argv[2] ?? '0010';

const arquivos = readdirSync(PASTA)
  .filter((nome) => nome.endsWith('.sql'))
  .sort()
  .filter((nome) => nome.slice(0, 4) >= apartirDe);

if (arquivos.length === 0) {
  console.error(`Nenhuma migration a partir de ${apartirDe} em ${PASTA}.`);
  process.exit(1);
}

const partes = [
  '-- =====================================================================',
  '-- PortalMPC — migrations pendentes, prontas para o SQL Editor',
  `-- Gerado em ${new Date().toISOString()}`,
  `-- Inclui: ${arquivos.join(', ')}`,
  '--',
  '-- Cole tudo de uma vez no SQL Editor do Supabase e execute.',
  '-- É seguro rodar mais de uma vez.',
  '-- =====================================================================',
  '',
  'begin;',
  '',
];

for (const arquivo of arquivos) {
  partes.push(
    '',
    '-- ---------------------------------------------------------------------',
    `-- ${arquivo}`,
    '-- ---------------------------------------------------------------------',
    '',
    readFileSync(join(PASTA, arquivo), 'utf8').trimEnd(),
    '',
  );
}

partes.push('', 'commit;', '');

writeFileSync(SAIDA, partes.join('\n'), 'utf8');
console.log(`${arquivos.length} migration(s) unidas em ${SAIDA}`);
for (const arquivo of arquivos) console.log(`  · ${arquivo}`);
