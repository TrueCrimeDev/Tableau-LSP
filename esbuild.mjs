import { build, context } from 'esbuild';

const flags = new Set(process.argv.slice(2));
for (const flag of flags) {
  if (!['--watch', '--sourcemap', '--minify'].includes(flag)) {
    throw new Error(`Unknown build option: ${flag}`);
  }
}

// Both processes use the same flags; watch never waits behind a separate build.
const options = {
  entryPoints: ['src/extension.ts', 'src/server.ts'],
  outdir: 'out',
  bundle: true,
  external: ['vscode'],
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: flags.has('--sourcemap'),
  minify: flags.has('--minify'),
  logLevel: 'info',
};

if (flags.has('--watch')) {
  options.plugins = [{
    name: 'watch-status',
    setup(builder) {
      builder.onStart(() => console.log('[watch] build started'));
      builder.onEnd(result => {
        for (const error of result.errors) {
          if (error.location) console.error(`${error.location.file}:${error.location.line}:${error.location.column + 1}: ${error.text}`);
        }
        console.log(`[watch] build finished with ${result.errors.length} errors`);
      });
    },
  }];
  const builder = await context(options);
  await builder.watch();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await builder.dispose(); process.exit(0); });
  }
} else {
  await build(options);
}
