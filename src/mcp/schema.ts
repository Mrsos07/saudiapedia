/** Minimal, dependency-free input schemas: one definition yields both the JSON Schema
 * advertised to MCP clients and a strict validator (unknown keys are rejected). */
export type JSONSchema = Record<string, unknown>;
export type Schema<T> = { json: JSONSchema; parse: (value: unknown, path: string) => T };
export type Infer<S> = S extends Schema<infer T> ? T : never;

export class InputError extends Error {}
const fail = (path: string, message: string): never => { throw new InputError(`${path}: ${message}`); };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export const s = {
  string(options: { min?: number; max: number; pattern?: RegExp; description?: string; format?: 'uri' }): Schema<string> {
    return {
      json: { type: 'string', maxLength: options.max, ...(options.min ? { minLength: options.min } : {}), ...(options.pattern ? { pattern: options.pattern.source } : {}), ...(options.format ? { format: options.format } : {}), ...(options.description ? { description: options.description } : {}) },
      parse(value, path) {
        if (typeof value !== 'string') return fail(path, 'expected a string');
        // Reject control characters except tab/newline; they have no place in editorial text.
        if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return fail(path, 'contains control characters');
        if (value.length > options.max) return fail(path, `longer than ${options.max} characters`);
        if (value.trim().length < (options.min ?? 0)) return fail(path, `shorter than ${options.min} characters`);
        if (options.pattern && !options.pattern.test(value)) return fail(path, 'has an invalid format');
        return value;
      },
    };
  },
  enum<const T extends string>(values: readonly T[], description?: string): Schema<T> {
    return {
      json: { type: 'string', enum: values, ...(description ? { description } : {}) },
      parse: (value, path) => typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T : fail(path, `expected one of ${values.join(', ')}`),
    };
  },
  integer(min: number, max: number, description?: string): Schema<number> {
    return {
      json: { type: 'integer', minimum: min, maximum: max, ...(description ? { description } : {}) },
      parse: (value, path) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fail(path, `expected an integer from ${min} to ${max}`),
    };
  },
  boolean(description?: string): Schema<boolean> {
    return { json: { type: 'boolean', ...(description ? { description } : {}) }, parse: (value, path) => typeof value === 'boolean' ? value : fail(path, 'expected true or false') };
  },
  literal<const T extends boolean>(value: T, description: string): Schema<T> {
    return { json: { type: 'boolean', const: value, description }, parse: (input, path) => input === value ? value : fail(path, `must be ${value}`) };
  },
  array<T>(item: Schema<T>, max: number, description?: string, min = 0): Schema<T[]> {
    return {
      json: { type: 'array', items: item.json, maxItems: max, ...(min ? { minItems: min } : {}), ...(description ? { description } : {}) },
      parse(value, path) {
        if (!Array.isArray(value)) return fail(path, 'expected an array');
        if (value.length > max) return fail(path, `more than ${max} items`);
        if (value.length < min) return fail(path, `fewer than ${min} items`);
        return value.map((entry, index) => item.parse(entry, `${path}[${index}]`));
      },
    };
  },
  object<const Shape extends Record<string, Schema<unknown>>, const Required extends keyof Shape = never>(shape: Shape, required: readonly Required[] = [], description?: string):
    Schema<{ [K in Required]: Infer<Shape[K]> } & { [K in Exclude<keyof Shape, Required>]?: Infer<Shape[K]> }> {
    return {
      json: { type: 'object', properties: Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.json])), required, additionalProperties: false, ...(description ? { description } : {}) },
      parse(value, path) {
        if (!record(value)) return fail(path, 'expected an object');
        for (const key of Object.keys(value)) if (!(key in shape)) fail(path, `unknown property "${key.slice(0, 40)}"`);
        const out: Record<string, unknown> = {};
        for (const [key, schema] of Object.entries(shape)) {
          if (value[key] === undefined || value[key] === null) {
            if ((required as readonly string[]).includes(key)) fail(`${path}.${key}`, 'is required');
            continue;
          }
          out[key] = schema.parse(value[key], `${path}.${key}`);
        }
        return out as never;
      },
    };
  },
};

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const ROUTE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
