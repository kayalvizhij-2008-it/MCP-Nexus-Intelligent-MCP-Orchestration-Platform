/**
 * Minimal JSON Schema validator covering the subset emitted by MCP tool
 * definitions (object/array primitives, enum, required, additionalProperties).
 * Used for pre-execution input validation and the compatibility inspector.
 */
export type SchemaIssue = { path: string; message: string };

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
  default?: unknown;
};

const TYPE_CHECKS: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => typeof v === 'number' && Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  null: (v) => v === null,
};

export function validateAgainstSchema(
  schema: JsonSchema | undefined,
  value: unknown,
  path = '$',
): SchemaIssue[] {
  if (!schema || typeof schema !== 'object') return [];
  const issues: SchemaIssue[] = [];

  if (Array.isArray(schema.anyOf) && schema.anyOf.length) {
    const ok = schema.anyOf.some((s) => validateAgainstSchema(s, value, path).length === 0);
    if (!ok) issues.push({ path, message: 'Value does not match any allowed schema' });
    return issues;
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) {
    const matches = schema.oneOf.filter((s) => validateAgainstSchema(s, value, path).length === 0);
    if (matches.length !== 1) issues.push({ path, message: 'Value must match exactly one schema' });
    return issues;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const matches = types.some((t) => TYPE_CHECKS[t]?.(value) ?? true);
    if (!matches) {
      issues.push({ path, message: `Expected ${types.join(' | ')}, received ${describe(value)}` });
      return issues;
    }
  }

  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    issues.push({ path, message: `Value must be one of: ${schema.enum.join(', ')}` });
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      issues.push({ path, message: `Value must be >= ${schema.minimum}` });
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      issues.push({ path, message: `Value must be <= ${schema.maximum}` });
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      issues.push({ path, message: `Must be at least ${schema.minLength} characters` });
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      issues.push({ path, message: `Must be at most ${schema.maxLength} characters` });
    }
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          issues.push({ path, message: `Must match pattern ${schema.pattern}` });
        }
      } catch {
        /* an invalid pattern is reported by the compatibility inspector */
      }
    }
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      issues.push(...validateAgainstSchema(schema.items, item, `${path}[${index}]`));
    });
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (record[key] === undefined || record[key] === null || record[key] === '') {
        issues.push({ path: `${path}.${key}`, message: 'Required field is missing' });
      }
    }
    const props = schema.properties ?? {};
    for (const [key, propSchema] of Object.entries(props)) {
      if (record[key] !== undefined) {
        issues.push(...validateAgainstSchema(propSchema, record[key], `${path}.${key}`));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in props)) {
          issues.push({ path: `${path}.${key}`, message: 'Unexpected property' });
        }
      }
    }
  }

  return issues;
}

export function schemaShape(schema: JsonSchema | undefined): {
  properties: Array<{ name: string; type: string; required: boolean; description?: string; enum?: unknown[]; default?: unknown }>;
  additionalPropertiesAllowed: boolean;
} {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  return {
    properties: Object.entries(props).map(([name, value]) => ({
      name,
      type: describeType(value),
      required: required.has(name),
      description: value.description,
      enum: value.enum,
      default: value.default,
    })),
    additionalPropertiesAllowed: schema?.additionalProperties !== false,
  };
}

function describeType(schema: JsonSchema | undefined): string {
  if (!schema) return 'unknown';
  if (schema.type) return Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type;
  if (schema.anyOf) return schema.anyOf.map(describeType).join(' | ');
  if (schema.oneOf) return schema.oneOf.map(describeType).join(' | ');
  if (schema.enum) return 'enum';
  return 'unknown';
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
