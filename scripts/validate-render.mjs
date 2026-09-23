import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const paths = [require.resolve('payload')];
const { load } = require(require.resolve('js-yaml', { paths }));
const Ajv = require(require.resolve('ajv/dist/2020.js', { paths })).default;

try {
  const response = await fetch('https://render.com/schema/render.yaml.json', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Schema unavailable');
  const schema = await response.json();
  const blueprint = load(await readFile(new URL('../.devin/render.yaml', import.meta.url), 'utf8'));
  const validate = new Ajv({ strict: false, allErrors: true, validateFormats: false }).compile(schema);
  if (!validate(blueprint)) {
    console.error(JSON.stringify(validate.errors.map(({ instancePath, message }) => ({ path: instancePath, message }))));
    process.exitCode = 1;
  } else console.log('Render Blueprint matches the official schema. No service was created.');
} catch {
  console.error('Blueprint validation failed. Check the YAML and access to the official Render schema.');
  process.exitCode = 1;
}
