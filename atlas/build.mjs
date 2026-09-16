// Builds the 3D-enabled Neurovascular Atlas.
//
// The atlas is a single self-contained HTML file with a minified app bundle
// inside it, and it has to stay that way: it is opened from a folder, with no
// server and no network. So the build does two things rather than rewriting
// the app:
//
//   1. Exports the bundle's own data and text helpers on window.__ATLAS__,
//      and adds a sixth view to the app's nav that renders an empty host
//      element. Four small, anchored edits; the anatomy is not duplicated.
//   2. Appends the 3D view's stylesheet and script, which mount into that
//      host and into the lesion explorer's map panel.
//
// Running it again on its own output is safe: the injected block is delimited
// and replaced, and the bundle edits are skipped if they are already there.
//
// Usage: node build.mjs [input.html] [output.html]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BEGIN = '<!-- nvx3d:begin -->';
const END = '<!-- nvx3d:end -->';

// Anchored edits to the app bundle. Each is applied once; `check` tells the
// build the edit is already present so a rebuild is a no-op.
const BUNDLE_EDITS = [
  {
    name: 'export atlas data and text helpers',
    check: 'window.__ATLAS__={data:vl',
    from: 'lr=e=>e[0].toUpperCase()+e.slice(1);function Gm(',
    to:
      'lr=e=>e[0].toUpperCase()+e.slice(1);' +
      'window.__ATLAS__={data:vl,colors:tr,groups:Zs,regionsAt:xi,sourcesFor:qm,cap:lr,' +
      'deficit:Gm,supply:Qm,orientation:Ym,outlines:null};' +
      'function Gm(',
  },
  {
    name: 'export plate outlines',
    check: 'Wy=window.__ATLAS__.outlines={m1:',
    from: 'var N=nt(Ci(),1),Wy={m1:',
    to: 'var N=nt(Ci(),1),Wy=window.__ATLAS__.outlines={m1:',
  },
  {
    name: 'add the 3D view to the nav',
    check: '["neuraxis","06","3D neuraxis"]',
    from: '["sources","05","Sources & scope"]]',
    to: '["sources","05","Sources & scope"],["neuraxis","06","3D neuraxis"]]',
  },
  {
    name: 'render the 3D view host',
    check: 'id:"nvx3d-host"',
    from: 'e==="explore"&&(0,c.jsxs)("div",{className:"explorer"',
    to: 'e==="neuraxis"&&(0,c.jsx)("div",{id:"nvx3d-host",className:"nvx3d-host"}),' +
      'e==="explore"&&(0,c.jsxs)("div",{className:"explorer"',
  },
];

// The geometry module is shared with the self-test, so it is written as an ES
// module and inlined here rather than duplicated.
function inlineGeometry(source) {
  const geometry = fs.readFileSync(path.join(here, 'src/geometry.mjs'), 'utf8')
    .replace(/^export (const|function|let|var|class)/gm, '$1')
    .split('\n')
    .map((line) => (line ? '  ' + line : line))
    .join('\n');
  if (!source.includes('// @inject geometry')) {
    throw new Error('neuraxis-3d.js no longer has the geometry injection point');
  }
  return source.replace('  // @inject geometry', geometry);
}

export function build(inputHtml) {
  let html = inputHtml;

  // Drop any previously injected block so a rebuild replaces it.
  const start = html.indexOf(BEGIN);
  const end = html.indexOf(END);
  if (start !== -1 && end !== -1) {
    html = html.slice(0, start) + html.slice(end + END.length).replace(/^\n/, '');
  }

  for (const edit of BUNDLE_EDITS) {
    if (html.includes(edit.check)) continue;
    const count = html.split(edit.from).length - 1;
    if (count !== 1) {
      throw new Error(
        `Cannot apply "${edit.name}": found ${count} matches for its anchor. ` +
        'The app bundle changed; update BUNDLE_EDITS in build.mjs.'
      );
    }
    html = html.replace(edit.from, edit.to);
  }

  const css = fs.readFileSync(path.join(here, 'src/neuraxis-3d.css'), 'utf8');
  const js = inlineGeometry(fs.readFileSync(path.join(here, 'src/neuraxis-3d.js'), 'utf8'));

  if (js.includes('</script>') || css.includes('</style>')) {
    throw new Error('Injected source would close its own tag');
  }

  const block = `${BEGIN}\n<style>\n${css}</style>\n<script>\n${js}</script>\n${END}\n`;
  if (!html.includes('</body>')) throw new Error('No </body> in the input document');
  return html.replace('</body>', `${block}</body>`);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invokedDirectly) {
  const input = process.argv[2] || path.join(here, 'Neurovascular-Atlas.html');
  const output = process.argv[3] || input;
  const built = build(fs.readFileSync(input, 'utf8'));
  fs.writeFileSync(output, built);
  const kb = (Buffer.byteLength(built) / 1024).toFixed(0);
  console.log(`Wrote ${path.relative(process.cwd(), output)} (${kb} KB)`);
}
