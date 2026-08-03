import Link from 'next/link';

import { ArrowRight, Construction } from 'lucide-react';

import { CabecalhoPagina } from '@/components/layout/CabecalhoPagina';
import { Cartao, Selo } from '@/components/ui';

/**
 * Página inicial das áreas ainda não desenvolvidas.
 * Organiza a expectativa sem dar qualquer acesso aos dados de Legalização.
 */
export function AreaEmConstrucao({
  area,
  descricao,
  previstos,
}: {
  area: string;
  descricao: string;
  previstos: string[];
}) {
  return (
    <>
      <CabecalhoPagina
        titulo={area}
        descricao={descricao}
        acoes={<Selo tom="alerta">Módulo em desenvolvimento</Selo>}
      />

      <div className="p-5 sm:p-7">
        <Cartao className="mx-auto max-w-2xl p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-marca-50 text-marca-600">
            <Construction className="h-7 w-7" />
          </div>

          <h2 className="mt-5 text-lg font-semibold text-texto">
            O módulo {area} ainda está sendo construído
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-texto-suave">
            Nesta primeira etapa o PortalMPC entrega o módulo de Legalização. A estrutura de
            autenticação, permissões e auditoria já está pronta para receber esta área — o que falta
            são as telas e as tabelas específicas.
          </p>

          <div className="mt-7 text-left">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-texto-suave">
              Previsto para este módulo
            </p>
            <ul className="space-y-2">
              {previstos.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 rounded-lg border border-borda bg-superficie px-3.5 py-2.5 text-sm text-texto"
                >
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-marca-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-7 border-t border-borda pt-5 text-xs text-texto-suave">
            Precisa de algo agora? Fale com o administrador do escritório ou volte ao{' '}
            <Link href="/" className="font-medium text-marca-700 hover:underline">
              seu painel inicial
            </Link>
            .
          </p>
        </Cartao>
      </div>
    </>
  );
}
