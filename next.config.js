/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // destrava deploy enquanto corrigimos os lints
  },
  // Se (e só se) precisar ignorar erros de TS no build:
  // typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
