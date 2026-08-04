import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // exceljs é usado apenas no servidor (rota de exportação); manter fora do bundle do cliente.
  serverExternalPackages: ['exceljs'],
};

export default nextConfig;
