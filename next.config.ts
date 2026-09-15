import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Importing here makes a missing/invalid environment variable fail the build
// rather than the first request that happens to touch the database.
import "./src/env";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The libSQL driver has a native component; it must stay a real Node require
  // instead of being bundled into the server output. nodemailer is here for a
  // related reason: it is CommonJS, resolves parts of itself with computed
  // `require`s, and reads its own package.json at runtime for the version
  // banner — none of which survive bundling.
  serverExternalPackages: ["@libsql/client", "libsql", "nodemailer"],
};

// Picks up `src/i18n/request.ts` by convention.
export default createNextIntlPlugin()(nextConfig);
