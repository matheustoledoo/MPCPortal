/**
 * Relatórios para imprimir ou salvar em PDF.
 *
 * O app antigo mandava o HTML ao Apps Script para virar PDF. Aqui o HTML é
 * montado no navegador, com os dados que a RLS já liberou para a pessoa, e
 * abre numa aba própria com a caixa de impressão — "Salvar como PDF" gera o
 * arquivo. Nada sai do portal e nenhuma chave entra no navegador.
 */

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Texto com quebras de linha preservadas. */
export const escBr = (s: unknown) => esc(s).replace(/\n/g, '<br>');

/** Estilo comum: o vinho do portal, tipografia simples, A4 retrato. */
export const ESTILO_RELATORIO = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, Arial, sans-serif; font-size: 10.5px; color: #0f172a; margin: 0; }
  .barra { display: flex; justify-content: space-between; align-items: center; gap: 12px;
           padding: 10px 14px; background: #fdf4f4; border-bottom: 1px solid #f1d4d6; }
  .barra button { font: inherit; font-weight: 600; border: 0; border-radius: 8px; padding: 8px 14px;
                  background: #b93540; color: #fff; cursor: pointer; }
  .barra span { color: #475569; }
  main { padding: 18px 4px; }
  .marca { color: #9b1c24; font-weight: 700; letter-spacing: 2px; font-size: 10px; }
  h1 { color: #821a21; font-size: 20px; margin: 2px 0 0; }
  h2 { background: #0f172a; color: #fff; font-size: 10.5px; letter-spacing: 1px; padding: 5px 8px;
       margin: 16px 0 6px; text-transform: uppercase; }
  .sub { color: #475569; margin: 4px 0 12px; line-height: 1.5; }
  .tot { margin: 0 0 12px; } .tot span { display: inline-block; margin-right: 16px; }
  table { border-collapse: collapse; width: 100%; font-size: inherit; }
  th { background: #9b1c24; color: #fff; text-align: left; padding: 5px; font-size: 9.5px; }
  td { border-bottom: 1px solid #e2e8f0; padding: 4px 5px; vertical-align: top; text-align: left; }
  tr { break-inside: avoid; }
  .fraco { color: #64748b; }
  .k { color: #475569; width: 32%; }
  .it { padding: 5px 0; border-bottom: 1px solid #eef2f7; break-inside: avoid; }
  .ok { color: #15803d; font-weight: 700; } .no { color: #94a3b8; }
  .o { color: #475569; font-style: italic; margin-top: 2px; } .r { margin-top: 2px; }
  .n { margin-top: 2px; background: #f8fafc; padding: 3px 6px; }
  .ass { margin-top: 44px; } .ass td { border: 0; width: 50%; padding: 0 18px; text-align: center; }
  .ass div { border-top: 1px solid #0f172a; padding-top: 4px; }
  @media print { .barra { display: none; } main { padding: 0; } }
`;

/**
 * Abre o relatório numa aba nova e chama a impressão. Precisa ser chamado
 * no clique (ou logo depois dele) para o navegador não bloquear a janela;
 * por isso devolve `false` quando a aba não abriu.
 */
export function abrirParaImprimir(titulo: string, corpo: string, janela?: Window | null): boolean {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title><style>${ESTILO_RELATORIO}</style></head><body>
<div class="barra"><span>Use <b>Salvar como PDF</b> na caixa de impressão para guardar o arquivo.</span>
<button onclick="window.print()">Imprimir / salvar PDF</button></div>
<main>${corpo}</main>
<script>window.addEventListener('load',function(){setTimeout(function(){window.print()},250)});</script>
</body></html>`;
  const alvo = janela ?? window.open('', '_blank');
  if (!alvo) return false;
  alvo.document.open();
  alvo.document.write(html);
  alvo.document.close();
  return true;
}

export function agoraBr(): string {
  return new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Nome de arquivo sem os caracteres que o Windows recusa. */
export const nomeDeArquivo = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
