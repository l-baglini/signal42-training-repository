/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Clean Architecture core (octokit, Claude Agent SDK, Prisma) runs only
  // server-side. Keep these out of the bundle so their Node-only internals
  // (child_process, native bindings) are required at runtime, not packed.
  serverExternalPackages: [
    "@prisma/client",
    "@anthropic-ai/claude-agent-sdk",
    "octokit",
  ],
  // No ESLint config in the project; don't let a missing config block builds.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
