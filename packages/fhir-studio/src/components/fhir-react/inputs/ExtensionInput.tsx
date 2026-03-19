/**
 * ExtensionInput — Extension (url + value[x]).
 *
 * Loads the extension's StructureDefinition to detect:
 *   1. Simple extensions (value[x] at root) → render value[x] input directly
 *   2. Complex extensions with sub-extension slices (e.g. race, ethnicity)
 *      → render each sub-slice's value[x] as a named field
 *
 * Falls back to simple url + valueString text fields if profile is unavailable.
 */

import { useState, useEffect, useContext, useCallback } from 'react';
import type { JSX } from 'react';
import type { InternalSchemaElement, ParsedSchema } from '../types/schema-types';
import { SchemaServiceContext } from '../context/SchemaContext';
import { ResourcePropertyInput } from '../ResourcePropertyInput/ResourcePropertyInput';
import { FormSection } from '../FormSection/FormSection';
import { TextInput } from '../../ui/TextInput';
import { Spinner } from '../../ui/Spinner';

export interface ExtensionInputProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  element: InternalSchemaElement;
  path: string;
  disabled?: boolean;
}

/** A detected sub-extension slice with its value[x] element. */
interface SubSlice {
  sliceName: string;
  url: string;
  label: string;
  valueElement: InternalSchemaElement;
}

/** Extract sub-extension slices from a parsed extension schema. */
function extractSubSlices(schema: ParsedSchema): SubSlice[] {
  const slices: SubSlice[] = [];
  const allEls = schema.allElements;

  for (const [, el] of allEls) {
    // Find extension slices: id like Extension.extension:ombCategory
    if (!el.sliceName || !el.id.includes(':')) continue;
    if (el.path !== 'Extension.extension') continue;

    // Find this slice's value[x] child
    const valueElId = `${el.id}.value[x]`;
    let valueEl: InternalSchemaElement | undefined;
    for (const [id, child] of allEls) {
      if (id === valueElId) { valueEl = child; break; }
    }
    if (!valueEl) continue;

    // Find the fixed url for this slice
    const urlElId = `${el.id}.url`;
    let fixedUrl = '';
    for (const [id, child] of allEls) {
      if (id === urlElId && child.fixed) { fixedUrl = child.fixed as string; break; }
    }

    slices.push({
      sliceName: el.sliceName,
      url: fixedUrl || el.sliceName,
      label: el.description ?? el.sliceName,
      valueElement: {
        ...valueEl,
        // Override name for proper propName resolution
        name: `value[x]`,
      },
    });
  }
  return slices;
}

/** Read a sub-extension's value from extension.extension[] array. */
function readSubExtValue(
  extensions: Array<Record<string, unknown>> | undefined,
  url: string,
): unknown {
  if (!extensions || !Array.isArray(extensions)) return undefined;
  const match = extensions.find((e) => e.url === url);
  if (!match) return undefined;
  // Find the value[x] key
  for (const k of Object.keys(match)) {
    if (k.startsWith('value') && k !== 'valueSet') return match[k];
  }
  return undefined;
}

/** Write a sub-extension's value back into extension.extension[] array. */
function writeSubExtValue(
  extensions: Array<Record<string, unknown>> | undefined,
  url: string,
  valueKey: string,
  newValue: unknown,
): Array<Record<string, unknown>> {
  const arr = Array.isArray(extensions) ? [...extensions] : [];
  // Remove existing entry for this URL
  const filtered = arr.filter((e) => e.url !== url);
  if (newValue == null) return filtered;
  return [...filtered, { url, [valueKey]: newValue }];
}

export function ExtensionInput({ value, onChange, element, path, disabled }: ExtensionInputProps): JSX.Element {
  const v = (value ?? {}) as Record<string, unknown>;
  const schemaService = useContext(SchemaServiceContext);

  const extensionUrl = element.type[0]?.profile?.[0] ?? (v.url as string | undefined);

  const [profileSchema, setProfileSchema] = useState<ParsedSchema | null>(null);
  const [subSlices, setSubSlices] = useState<SubSlice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!extensionUrl || !schemaService || loadFailed) return;
    if (profileSchema?.url === extensionUrl) return;

    let cancelled = false;
    setLoading(true);

    const profileId = extensionUrl.split('/').pop() ?? extensionUrl;
    schemaService.loadProfileSchema(profileId).then(
      (schema) => {
        if (!cancelled) {
          setProfileSchema(schema);
          setSubSlices(extractSubSlices(schema));
          setLoading(false);
        }
      },
      () => {
        if (!cancelled) {
          setLoadFailed(true);
          setLoading(false);
        }
      },
    );

    return () => { cancelled = true; };
  }, [extensionUrl, schemaService, profileSchema?.url, loadFailed]);

  const handleSubSliceChange = useCallback((slice: SubSlice, newValue: unknown, propName?: string) => {
    // propName is like "valueCoding" or "valueString"
    const valueKey = propName ?? 'valueString';
    const innerExts = v.extension as Array<Record<string, unknown>> | undefined;
    const updated = writeSubExtValue(innerExts, slice.url, valueKey, newValue);
    const next = { ...v, url: extensionUrl, extension: updated.length > 0 ? updated : undefined };
    if (!next.extension) delete next.extension;
    onChange(next);
  }, [v, extensionUrl, onChange]);

  // Complex extension with sub-slices → render each sub-slice's value[x]
  if (profileSchema && subSlices.length > 0) {
    const innerExts = v.extension as Array<Record<string, unknown>> | undefined;

    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        {subSlices.map((slice) => {
          const fieldValue = readSubExtValue(innerExts, slice.url);
          return (
            <FormSection
              key={slice.sliceName}
              title={slice.label}
              htmlFor={slice.sliceName}
            >
              <ResourcePropertyInput
                element={slice.valueElement}
                path={`${path}.extension.${slice.sliceName}`}
                value={fieldValue}
                onChange={(val, propName) => handleSubSliceChange(slice, val, propName)}
                arrayElement={true}
                disabled={disabled}
              />
            </FormSection>
          );
        })}
      </div>
    );
  }

  // Simple extension with root value[x] → render value[x] directly
  if (profileSchema && subSlices.length === 0) {
    // Find the root value[x] element
    let rootValueEl: InternalSchemaElement | undefined;
    for (const [, el] of profileSchema.allElements) {
      if (el.path === 'Extension.value[x]' && !el.id.includes(':')) {
        rootValueEl = el;
        break;
      }
    }

    if (rootValueEl && rootValueEl.type.length > 0) {
      // Read value from parent object
      let fieldValue: unknown;
      for (const k of Object.keys(v)) {
        if (k.startsWith('value') && k !== 'valueSet') { fieldValue = v[k]; break; }
      }

      return (
        <ResourcePropertyInput
          element={{ ...rootValueEl, name: 'value[x]' }}
          path={`${path}.value`}
          value={fieldValue}
          onChange={(val, propName) => {
            // Clear old value keys, set new one
            const next: Record<string, unknown> = { url: extensionUrl };
            if (val != null && propName) next[propName] = val;
            onChange(next);
          }}
          arrayElement={true}
          disabled={disabled}
        />
      );
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Spinner size="sm" />
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
          Loading extension profile...
        </span>
      </div>
    );
  }

  // Fallback: simple url + value fields
  return (
    <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
      <TextInput
        value={(v.url as string) ?? ''}
        onChange={(url) => onChange({ ...v, url: url || undefined })}
        placeholder="Extension URL"
        disabled={disabled}
      />
      <TextInput
        value={(v.valueString as string) ?? JSON.stringify(v.value ?? '')}
        onChange={(val) => onChange({ ...v, valueString: val || undefined })}
        placeholder="value"
        disabled={disabled}
      />
    </div>
  );
}
