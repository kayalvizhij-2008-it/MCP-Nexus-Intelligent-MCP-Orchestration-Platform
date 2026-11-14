import React from 'react';
import { Field, Input, Select, Textarea } from './ui.js';

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, any>;
  required?: string[];
  description?: string;
  enum?: unknown[];
  default?: unknown;
  items?: any;
};

/**
 * Renders a form from a tool's JSON input schema. Values are kept as strings and
 * coerced back to typed arguments by the caller before execution.
 */
export function SchemaForm({
  schema,
  values,
  onChange,
}: {
  schema: JsonSchema | undefined;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}) {
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const entries = Object.entries<any>(properties);

  if (!entries.length) {
    return (
      <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12px] text-slate-500">
        This tool accepts no arguments.
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {entries.map(([name, property]: [string, any]) => {
        const value = values[name] ?? '';
        const type = Array.isArray(property.type) ? property.type[0] : property.type;
        const isRequired = required.has(name);
        const label = `${name}${isRequired ? ' *' : ''}`;
        const hint =
          property.description ??
          (type === 'array' ? 'JSON array' : type === 'object' ? 'JSON object' : undefined);

        const set = (next: string) => onChange({ ...values, [name]: next });

        if (property.enum) {
          return (
            <Field key={name} label={label} hint={hint}>
              <Select value={value} onChange={(event) => set(event.target.value)}>
                <option value="">{isRequired ? 'Select a value…' : 'Default'}</option>
                {property.enum.map((option: unknown) => (
                  <option key={String(option)} value={String(option)}>
                    {String(option)}
                  </option>
                ))}
              </Select>
            </Field>
          );
        }

        if (type === 'boolean') {
          return (
            <Field key={name} label={label} hint={hint}>
              <Select value={value} onChange={(event) => set(event.target.value)}>
                <option value="">Default</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </Select>
            </Field>
          );
        }

        if (type === 'array' || type === 'object') {
          return (
            <Field key={name} label={label} hint={hint}>
              <Textarea
                rows={4}
                value={value}
                onChange={(event) => set(event.target.value)}
                placeholder={type === 'array' ? '[]' : '{}'}
                className="input-mono"
              />
            </Field>
          );
        }

        if (type === 'number' || type === 'integer') {
          return (
            <Field key={name} label={label} hint={hint}>
              <Input
                type="number"
                value={value}
                onChange={(event) => set(event.target.value)}
                placeholder={property.default !== undefined ? String(property.default) : '0'}
              />
            </Field>
          );
        }

        const isLong = /text|content|code|body|sql|query|description|message/i.test(name);
        return (
          <Field key={name} label={label} hint={hint}>
            {isLong ? (
              <Textarea
                rows={4}
                value={value}
                onChange={(event) => set(event.target.value)}
                placeholder={property.default !== undefined ? String(property.default) : undefined}
              />
            ) : (
              <Input
                value={value}
                onChange={(event) => set(event.target.value)}
                placeholder={property.default !== undefined ? String(property.default) : undefined}
              />
            )}
          </Field>
        );
      })}
    </div>
  );
}

export function coerceArguments(
  schema: JsonSchema | undefined,
  values: Record<string, string>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const properties = schema?.properties ?? {};
  for (const [key, raw] of Object.entries(values)) {
    if (raw === '' || raw === undefined) continue;
    const property = properties[key] ?? {};
    const type = Array.isArray(property.type) ? property.type[0] : property.type;
    if (type === 'number' || type === 'integer') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) throw new Error(`${key} must be a number`);
      output[key] = parsed;
    } else if (type === 'boolean') {
      output[key] = raw === 'true';
    } else if (type === 'array' || type === 'object') {
      try {
        output[key] = JSON.parse(raw);
      } catch {
        throw new Error(`${key} must be valid JSON`);
      }
    } else {
      output[key] = raw;
    }
  }
  return output;
}

export function schemaSummary(schema: JsonSchema | undefined): {
  count: number;
  required: string[];
  names: string[];
} {
  const names = Object.keys(schema?.properties ?? {});
  return { count: names.length, required: schema?.required ?? [], names };
}
