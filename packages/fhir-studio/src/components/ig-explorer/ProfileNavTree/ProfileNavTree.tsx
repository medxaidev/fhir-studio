/**
 * ProfileNavTree — Left-side navigation tree for Profiles tab.
 *
 * Groups profiles by baseType into:
 * - Resources (by type, e.g., Patient, Observation)
 * - Complex Types
 * - Primitive Types (collapsed by default)
 *
 * Includes search input and filter buttons.
 */

import { useState, useMemo } from 'react';
import type { IGResourceRef } from 'fhir-rest-client';
import styles from './ProfileNavTree.module.css';

// Known FHIR primitive type names
const PRIMITIVE_TYPES = new Set([
  'boolean', 'integer', 'integer64', 'string', 'decimal', 'uri', 'url',
  'canonical', 'base64Binary', 'instant', 'date', 'dateTime', 'time',
  'code', 'oid', 'id', 'markdown', 'unsignedInt', 'positiveInt', 'uuid',
  'xhtml',
]);

// Known FHIR complex data types (non-resource)
const COMPLEX_DATA_TYPES = new Set([
  'Address', 'Age', 'Annotation', 'Attachment', 'CodeableConcept', 'Coding',
  'ContactDetail', 'ContactPoint', 'Contributor', 'Count', 'DataRequirement',
  'Distance', 'Dosage', 'Duration', 'Expression', 'HumanName', 'Identifier',
  'MarketingStatus', 'Meta', 'Money', 'MoneyQuantity', 'Narrative',
  'ParameterDefinition', 'Period', 'Population', 'ProdCharacteristic',
  'ProductShelfLife', 'Quantity', 'Range', 'Ratio', 'RatioRange',
  'Reference', 'RelatedArtifact', 'SampledData', 'Signature',
  'SimpleQuantity', 'SubstanceAmount', 'Timing', 'TriggerDefinition',
  'UsageContext', 'Element', 'BackboneElement',
]);

type FilterMode = 'all' | 'resource' | 'type' | 'primitive';

interface ProfileGroup {
  /** Resource type groups: type → profiles */
  resources: Map<string, IGResourceRef[]>;
  complexTypes: IGResourceRef[];
  primitiveTypes: IGResourceRef[];
}

function groupProfiles(profiles: IGResourceRef[]): ProfileGroup {
  const resources = new Map<string, IGResourceRef[]>();
  const complexTypes: IGResourceRef[] = [];
  const primitiveTypes: IGResourceRef[] = [];

  for (const p of profiles) {
    const baseType = p.type || '';
    if (PRIMITIVE_TYPES.has(baseType) || PRIMITIVE_TYPES.has(baseType.toLowerCase())) {
      primitiveTypes.push(p);
    } else if (COMPLEX_DATA_TYPES.has(baseType)) {
      complexTypes.push(p);
    } else {
      // Resource type
      const group = resources.get(baseType) || [];
      group.push(p);
      resources.set(baseType, group);
    }
  }

  return { resources, complexTypes, primitiveTypes };
}

interface ProfileNavTreeProps {
  profiles: IGResourceRef[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ProfileNavTree({ profiles, selectedId, onSelect }: ProfileNavTreeProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(['primitive']));
  const [collapsedSubGroups, setCollapsedSubGroups] = useState<Set<string>>(() => new Set());

  // Filter + search
  const filtered = useMemo(() => {
    let list = profiles;

    // Apply search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.id || '').toLowerCase().includes(q) ||
        (p.type || '').toLowerCase().includes(q)
      );
    }

    // Apply filter
    if (filter === 'resource') {
      list = list.filter((p) => {
        const t = p.type || '';
        return !PRIMITIVE_TYPES.has(t) && !PRIMITIVE_TYPES.has(t.toLowerCase()) && !COMPLEX_DATA_TYPES.has(t);
      });
    } else if (filter === 'type') {
      list = list.filter((p) => COMPLEX_DATA_TYPES.has(p.type || ''));
    } else if (filter === 'primitive') {
      list = list.filter((p) => {
        const t = p.type || '';
        return PRIMITIVE_TYPES.has(t) || PRIMITIVE_TYPES.has(t.toLowerCase());
      });
    }

    return list;
  }, [profiles, search, filter]);

  const grouped = useMemo(() => groupProfiles(filtered), [filtered]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleSubGroup = (key: string) => {
    setCollapsedSubGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resourceCount = Array.from(grouped.resources.values()).reduce((s, g) => s + g.length, 0);

  return (
    <div className={styles.container}>
      {/* Search */}
      <div className={styles.searchBox}>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search profiles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filter bar */}
      <div className={styles.filterBar}>
        {(['all', 'resource', 'type', 'primitive'] as FilterMode[]).map((f) => (
          <button
            key={f}
            className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'resource' ? 'Resource' : f === 'type' ? 'Type' : 'Primitive'}
          </button>
        ))}
      </div>

      {/* Tree body */}
      <div className={styles.treeBody}>
        {filtered.length === 0 && (
          <div className={styles.emptyText}>No matching profiles</div>
        )}

        {/* Resources group */}
        {resourceCount > 0 && (
          <div className={styles.group}>
            <button className={styles.groupHeader} onClick={() => toggleGroup('resources')}>
              <span className={`${styles.groupChevron} ${!collapsedGroups.has('resources') ? styles.groupChevronOpen : ''}`}>
                ›
              </span>
              <span className={styles.groupIcon}>📦</span>
              Resources
              <span className={styles.groupCount}>{resourceCount}</span>
            </button>
            {!collapsedGroups.has('resources') && (
              <div>
                {Array.from(grouped.resources.entries())
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([type, items]) => (
                    <div key={type} className={styles.subGroup}>
                      <button className={styles.subGroupHeader} onClick={() => toggleSubGroup(`res:${type}`)}>
                        <span className={`${styles.subGroupChevron} ${!collapsedSubGroups.has(`res:${type}`) ? styles.subGroupChevronOpen : ''}`}>
                          ›
                        </span>
                        {type || 'Unknown'}
                        <span className={styles.subGroupCount}>({items.length})</span>
                      </button>
                      {!collapsedSubGroups.has(`res:${type}`) && items.map((p) => (
                        <button
                          key={p.id}
                          className={`${styles.profileItem} ${p.id === selectedId ? styles.profileItemActive : ''}`}
                          onClick={() => onSelect(p.id)}
                          title={p.url}
                        >
                          <span className={styles.profileName}>{p.name || p.id}</span>
                        </button>
                      ))}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Complex Types group */}
        {grouped.complexTypes.length > 0 && (
          <div className={styles.group}>
            <button className={styles.groupHeader} onClick={() => toggleGroup('complex')}>
              <span className={`${styles.groupChevron} ${!collapsedGroups.has('complex') ? styles.groupChevronOpen : ''}`}>
                ›
              </span>
              <span className={styles.groupIcon}>🧩</span>
              Complex Types
              <span className={styles.groupCount}>{grouped.complexTypes.length}</span>
            </button>
            {!collapsedGroups.has('complex') && grouped.complexTypes.map((p) => (
              <button
                key={p.id}
                className={`${styles.profileItem} ${p.id === selectedId ? styles.profileItemActive : ''}`}
                onClick={() => onSelect(p.id)}
                title={p.url}
              >
                <span className={styles.profileName}>{p.name || p.id}</span>
              </button>
            ))}
          </div>
        )}

        {/* Primitive Types group (collapsed by default) */}
        {grouped.primitiveTypes.length > 0 && (
          <div className={styles.group}>
            <button className={styles.groupHeader} onClick={() => toggleGroup('primitive')}>
              <span className={`${styles.groupChevron} ${!collapsedGroups.has('primitive') ? styles.groupChevronOpen : ''}`}>
                ›
              </span>
              <span className={styles.groupIcon}>🔹</span>
              Primitive Types
              <span className={styles.groupCount}>{grouped.primitiveTypes.length}</span>
            </button>
            {!collapsedGroups.has('primitive') && grouped.primitiveTypes.map((p) => (
              <button
                key={p.id}
                className={`${styles.profileItem} ${p.id === selectedId ? styles.profileItemActive : ''}`}
                onClick={() => onSelect(p.id)}
                title={p.url}
              >
                <span className={styles.profileName}>{p.name || p.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
