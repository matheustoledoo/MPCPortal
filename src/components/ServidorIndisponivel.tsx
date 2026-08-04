import { PlugZap } from 'lucide-react';

import { MarcaMPC } from '@/components/MarcaMPC';
import { Cartao } from '@/components/ui';

/**
 * Mostrada quando o servidor da aplicação não consegue falar com o Supabase.
 *
 * A causa quase sempre é ambiente, não código: em rede corporativa com
 * inspeção de TLS, o navegador confia no certificado da empresa (ele está no
 * Windows) mas o Node.js não, porque usa a própria lista de autoridades.
 * O sintoma clássico é `AuthRetryableFetchError: fetch failed` com status 0.
 */
export function ServidorIndisponivel({ detalhe }: { detalhe?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">
        <div className="flex justify-center">
          <MarcaMPC tamanho="md" />
        </div>

        <Cartao className="mt-10 p-8">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-alerta-suave text-alerta">
              <PlugZap className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-texto">
                Não foi possível falar com o servidor de autenticação
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-texto-suave">
                O portal está no ar, mas o processo do Node.js não conseguiu alcançar o Supabase.
                Sua sessão continua válida — é a máquina que roda o portal que está sem caminho até
                a nuvem.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-borda bg-superficie p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-texto-suave">
              Causa mais comum
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-texto">
              Rede corporativa com inspeção de TLS. O navegador aceita o certificado da empresa
              porque ele está no Windows; o Node.js usa a própria lista de autoridades e recusa a
              conexão.
            </p>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-suave">
              Como resolver
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-texto-suave">
              <li>
                Pare o servidor e suba de novo mandando o Node confiar nos certificados do Windows:
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-grafite-800 p-3 font-mono text-xs text-white">
                  {'$env:NODE_OPTIONS="--use-system-ca"\nnpm run start'}
                </pre>
              </li>
              <li>
                Se persistir, exporte o certificado raiz da empresa (.cer) e aponte para ele:
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-grafite-800 p-3 font-mono text-xs text-white">
                  {'$env:NODE_EXTRA_CA_CERTS="C:\\caminho\\ca-empresa.cer"\nnpm run start'}
                </pre>
              </li>
              <li>Fora da VPN corporativa, normalmente funciona sem nenhum ajuste.</li>
            </ol>
          </div>

          {detalhe && (
            <details className="mt-5">
              <summary className="cursor-pointer text-xs font-medium text-texto-suave hover:text-texto">
                Detalhe técnico
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-borda bg-superficie p-3 font-mono text-[11px] text-texto-suave">
                {detalhe}
              </pre>
            </details>
          )}
        </Cartao>
      </div>
    </main>
  );
}
