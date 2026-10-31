// Runs the Khronos glTF-Validator over every .glb in one or more folders.
//   npm run validate:glb -- build/blender-polished [more folders...]
// External resources (e.g. the shared atlas PNGs) are read from next to each file.
// Exit code 1 if any file has an error or a warning.
import fs from 'node:fs';
import path from 'node:path';
import validator from 'gltf-validator';

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('usage: npm run validate:glb -- <folder> [folder...]');
  process.exit(2);
}
let failed = false;
for (const dir of dirs) {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.glb')).sort();
  let errors = 0;
  let warnings = 0;
  for (const f of files) {
    const r = await validator.validateBytes(new Uint8Array(fs.readFileSync(path.join(dir, f))), {
      uri: f,
      // External images (the shared texture atlas) are loaded relative to the .glb.
      externalResourceFunction: async (uri) => new Uint8Array(fs.readFileSync(path.join(dir, decodeURIComponent(uri)))),
    });
    errors += r.issues.numErrors;
    warnings += r.issues.numWarnings;
    if (r.issues.numErrors || r.issues.numWarnings) {
      console.log(`✖ ${f}: ${r.issues.numErrors} errors, ${r.issues.numWarnings} warnings`);
      for (const m of r.issues.messages.filter((m) => m.severity <= 1).slice(0, 5)) console.log(`    ${m.code}: ${m.message} ${m.pointer ?? ''}`);
    }
  }
  console.log(`${dir}: ${files.length} files, ${errors} errors, ${warnings} warnings`);
  if (errors || warnings) failed = true;
}
process.exit(failed ? 1 : 0);
