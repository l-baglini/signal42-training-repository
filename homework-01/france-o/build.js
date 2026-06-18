'use strict';

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { generateIcons } = require('./scripts/generate-icons');

const SRC = 'src';
const OUT = 'dist';

// Static files copied verbatim into dist (relative to SRC).
const STATIC_FILES = ['manifest.json', 'devtools.html', 'panel.html'];

// JS entry points. Each is bundled into dist/<name>.js, which is what
// manifest.json / the HTML pages reference.
const ENTRY_POINTS = {
  background: `${SRC}/background.ts`,
  content: `${SRC}/content.ts`,
  inject: `${SRC}/inject.ts`,
  devtools: `${SRC}/devtools.ts`,
  panel: `${SRC}/panel.ts`,
};

function copyStatic() {
  for (const file of STATIC_FILES) {
    fs.copyFileSync(path.join(SRC, file), path.join(OUT, file));
  }
}

async function main() {
  const watch = process.argv.includes('--watch');

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });

  generateIcons(path.join(OUT, 'icons'));
  copyStatic();

  const options = {
    entryPoints: ENTRY_POINTS,
    bundle: true,
    outdir: OUT,
    format: 'iife',
    target: ['chrome110'],
    logLevel: 'info',
  };

  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('Watching for changes... (static assets copied once at startup)');
  } else {
    await esbuild.build(options);
    console.log('Build complete -> dist/  (load this folder as an unpacked extension)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
