// Bundles server.ts into a single CommonJS file with its dependencies inlined.
//
// Shared by the host binary (scripts/build-host.mjs) and the Docker image, so
// the externals and defines are defined once. Run directly to produce
// dist/server.cjs.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';

export async function bundleServer({ outfile, packaged = false }) {
  await build({
    entryPoints: ['server.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    // `next` is only reachable on the dev code path, which neither the binary
    // nor the container takes: both serve a prebuilt static bundle. The ws
    // extras are optional native speedups that ws already require()s safely.
    external: ['next', 'bufferutil', 'utf-8-validate'],
    define: {
      'process.env.SABACC_PACKAGED': packaged ? '"true"' : '"false"',
      'process.env.NODE_ENV': '"production"',
    },
    legalComments: 'none',
    logLevel: 'warning',
  });
  return outfile;
}

// Direct invocation: the container build calls this. pathToFileURL rather than
// string-building, which does not match on Windows paths.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outfile = process.argv[2] ?? 'dist/server.cjs';
  await bundleServer({ outfile });
  console.log(`> bundled ${outfile}`);
}
