import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "esbuild";

const outdir = resolve("dist/public");

await mkdir(outdir, { recursive: true });

await build({
  entryPoints: {
    app: resolve("src/web/client.tsx")
  },
  outdir,
  bundle: true,
  platform: "browser",
  format: "esm",
  target: ["es2022"],
  sourcemap: true,
  logLevel: "info",
  legalComments: "none"
});
