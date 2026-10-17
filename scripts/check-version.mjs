// Release guard: manifest.json and package.json must carry the same SemVer
// version, and when a tag is given (argument or GITHUB_REF_NAME on a tag push)
// it must be exactly `v<version>`. Exits non-zero on any mismatch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf-8'));

const manifest = read('manifest.json');
const pkg = read('package.json');
const semver = /^\d+\.\d+\.\d+$/;

const errors = [];
if (!semver.test(manifest.version))
  errors.push(`manifest.json version "${manifest.version}" is not x.y.z`);
if (manifest.version !== pkg.version) {
  errors.push(`manifest.json (${manifest.version}) and package.json (${pkg.version}) disagree`);
}

const tag =
  process.argv[2] ??
  (process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined);
if (tag && tag !== `v${manifest.version}`) {
  errors.push(`tag "${tag}" does not match version v${manifest.version}`);
}

if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ version ${manifest.version}${tag ? ` matches tag ${tag}` : ''}`);
