/**
 * ReferenceInput — FHIR Reference (reference + display).
 *
 * Provides a resource type selector + searchable Combobox that searches
 * the FHIR server for matching resources. Shows a selected reference as
 * a chip with an × remove button.
 */

import { useState, useEffect, useCallback } from 'react';
import type { JSX } from 'react';
import { Combobox } from '../../ui/Combobox';
import type { ComboboxOption } from '../../ui/Combobox';
import { SelectInput } from '../../ui/SelectInput';
import { TextInput } from '../../ui/TextInput';
import { serverStore } from '../../../stores/server-store';
import styles from './ReferenceInput.module.css';

export interface ReferenceInputProps {
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  targetTypes?: string[];
  disabled?: boolean;
}

/**
 * Extract resource type names from targetProfile URLs.
 * e.g. "http://hl7.org/fhir/StructureDefinition/Patient" → "Patient"
 */
function extractTargetTypes(profiles?: string[]): string[] {
  if (!profiles || profiles.length === 0) return [];
  return profiles
    .map((p) => p.split('/').pop() ?? '')
    .filter(Boolean);
}

export function ReferenceInput({ value, onChange, targetTypes, disabled }: ReferenceInputProps): JSX.Element {
  const v = value ?? {};
  const reference = (v.reference as string) ?? '';
  const display = (v.display as string) ?? '';
  const types = extractTargetTypes(targetTypes);

  const [selectedType, setSelectedType] = useState(() => types[0] ?? '');
  const [searchResults, setSearchResults] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback((query: string) => {
    const resType = selectedType;
    if (!resType) return;
    const client = serverStore.getClient();
    if (!client) return;

    setLoading(true);
    const params: Record<string, string> = { _count: '20' };
    if (query) {
      // Use _filter or name search depending on type
      if (['Patient', 'Practitioner', 'RelatedPerson', 'Person'].includes(resType)) {
        params.name = query;
      } else {
        params._content = query;
      }
    }

    client.search(resType, params)
      .then((bundle) => {
        const entries = (bundle.entry ?? [])
          .map((e: { resource?: Record<string, unknown> }) => e.resource)
          .filter(Boolean) as Record<string, unknown>[];
        setSearchResults(
          entries.map((r) => {
            const id = r.id as string;
            const rt = r.resourceType as string;
            const ref = `${rt}/${id}`;
            const disp = getResourceDisplay(r);
            return { value: ref, label: disp ? `${disp} (${ref})` : ref };
          }),
        );
      })
      .catch(() => setSearchResults([]))
      .finally(() => setLoading(false));
  }, [selectedType]);

  // Load initial results when type changes
  useEffect(() => {
    if (selectedType) doSearch('');
  }, [selectedType, doSearch]);

  // If already has a reference, show it as a chip
  if (reference && !disabled) {
    return (
      <div className={styles.refChip}>
        <span className={styles.refText}>
          {display ? `${display} (${reference})` : reference}
        </span>
        <button
          type="button"
          className={styles.removeBtn}
          onClick={() => onChange(undefined)}
          title="Remove reference"
        >
          ×
        </button>
      </div>
    );
  }

  if (reference && disabled) {
    return (
      <div className={styles.refChip}>
        <span className={styles.refText}>
          {display ? `${display} (${reference})` : reference}
        </span>
      </div>
    );
  }

  // No target types known → fallback to text input
  if (types.length === 0) {
    return (
      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
        <TextInput
          value={reference}
          onChange={(ref) => onChange({ ...v, reference: ref || undefined })}
          placeholder="ResourceType/id"
          disabled={disabled}
        />
        <TextInput
          value={display}
          onChange={(d) => onChange({ ...v, display: d || undefined })}
          placeholder="display"
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className={styles.refSelector}>
      {types.length > 1 && (
        <SelectInput
          className={styles.typeSelect}
          value={selectedType}
          onChange={setSelectedType}
          options={types.map((t) => ({ value: t, label: t }))}
          disabled={disabled}
        />
      )}
      <div className={styles.searchInput}>
        <Combobox
          options={searchResults}
          value=""
          onChange={(ref) => {
            if (!ref) return;
            const match = searchResults.find((r) => r.value === ref);
            const disp = match?.label.split(' (')[0];
            onChange({ reference: ref, ...(disp ? { display: disp } : {}) });
          }}
          onSearch={(q) => doSearch(q)}
          loading={loading}
          disabled={disabled}
          placeholder={`Search ${selectedType || 'resource'}...`}
          clearable
        />
      </div>
    </div>
  );
}

/** Extract a human-readable display from a FHIR resource. */
function getResourceDisplay(resource: Record<string, unknown>): string {
  const rt = resource.resourceType as string;
  // Patient / Practitioner: use name
  if (resource.name) {
    const names = resource.name as Array<Record<string, unknown>> | Record<string, unknown>;
    const name = Array.isArray(names) ? names[0] : names;
    if (name) {
      const given = ((name.given as string[]) ?? []).join(' ');
      const family = (name.family as string) ?? '';
      const text = (name.text as string) ?? '';
      if (text) return text;
      if (given || family) return `${given} ${family}`.trim();
    }
  }
  // Generic: use title, description, or code
  if (resource.title) return resource.title as string;
  if (resource.description) return (resource.description as string).slice(0, 80);
  if (resource.code) {
    const code = resource.code as Record<string, unknown>;
    if (code.text) return code.text as string;
  }
  return `${rt}/${resource.id}`;
}
