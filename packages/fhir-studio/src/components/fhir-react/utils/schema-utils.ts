/**
 * Parse a StructureDefinition's snapshot.element[] into InternalSchemaElement maps.
 *
 * This is the core algorithm that transforms the flat FHIR element array
 * into the Record<string, InternalSchemaElement> format used by the form engine.
 *
 * @module fhir-react/utils/schema-utils
 */

import type {
  InternalSchemaElement,
  TypeInfo,
  BindingDef,
  ConstraintDef,
  SlicingDef,
  ParsedSchema,
} from '../types/schema-types';

// ─── Raw SD element shape (loose, from server JSON) ─────────────────────────

interface RawElement {
  id?: string;
  path?: string;
  min?: number;
  max?: string;
  type?: Array<{ code?: string; profile?: string[]; targetProfile?: string[] }>;
  binding?: { strength?: string; valueSet?: string };
  short?: string;
  definition?: string;
  isModifier?: boolean;
  isSummary?: boolean;
  mustSupport?: boolean;
  constraint?: Array<{ key?: string; human?: string; severity?: string }>;
  sliceName?: string;
  slicing?: {
    discriminator?: Array<{ type?: string; path?: string }>;
    rules?: string;
    ordered?: boolean;
  };
  [key: string]: unknown;
}

interface RawStructureDefinition {
  resourceType?: string;
  url?: string;
  name?: string;
  type?: string;
  baseDefinition?: string;
  snapshot?: { element?: RawElement[] };
}

// ─── Properties to exclude from form rendering ──────────────────────────────

const READONLY_PROPERTIES = new Set(['id', 'resourceType']);

const IGNORED_TOP_LEVEL = new Set([
  'id', 'meta', 'implicitRules', 'language', 'text', 'contained', 'resourceType',
]);

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a StructureDefinition JSON into a ParsedSchema.
 */
export function parseStructureDefinition(sd: Record<string, unknown>): ParsedSchema {
  const raw = sd as unknown as RawStructureDefinition;
  const elements = raw.snapshot?.element ?? [];
  const resourceType = raw.type ?? '';
  const rootPath = resourceType;

  // Build full map of ALL elements keyed by id (to preserve slices that share the same path)
  const allElements = new Map<string, InternalSchemaElement>();
  for (const el of elements) {
    if (!el.path) continue;
    const parsed = parseElement(el, rootPath);
    // Use id as key to avoid overwriting slices (e.g. Patient.extension:race vs Patient.extension:ethnicity)
    const key = parsed.id || el.path;
    allElements.set(key, parsed);
  }

  // Build top-level elements map (direct children of root)
  const topElements: Record<string, InternalSchemaElement> = {};
  for (const [, el] of allElements) {
    if (!isDirectChild(rootPath, el.path)) continue;
    // Include extension slices as named fields (keyed by sliceName)
    if (el.sliceName && el.id.includes(':')) {
      topElements[el.sliceName] = el;
      continue;
    }
    // Skip other slice entries (contain ':')
    if (el.id.includes(':')) continue;
    topElements[el.name] = el;
  }

  return {
    url: (raw.url ?? '') as string,
    type: resourceType,
    name: (raw.name ?? resourceType) as string,
    baseDefinition: raw.baseDefinition,
    elements: topElements,
    allElements,
  };
}

/**
 * Get child elements for a given parent path from the full allElements map.
 * Used by BackboneElementInput for recursive rendering.
 */
export function getChildElements(
  parentPath: string,
  allElements: Map<string, InternalSchemaElement>,
): Record<string, InternalSchemaElement> {
  const result: Record<string, InternalSchemaElement> = {};
  for (const [, el] of allElements) {
    if (!isDirectChild(parentPath, el.path)) continue;
    // Include extension slices as named fields
    if (el.sliceName && el.id.includes(':')) {
      result[el.sliceName] = el;
      continue;
    }
    if (el.id.includes(':')) continue;
    result[el.name] = el;
  }
  return result;
}

/**
 * Filter elements to only those that should be rendered in the form.
 * Similar to Medplum's getElementsToRender.
 */
export function getElementsToRender(
  elements: Record<string, InternalSchemaElement>,
): [string, InternalSchemaElement][] {
  return Object.entries(elements).filter(([key, el]) => {
    if (el.type.length === 0) return false;
    if (el.max === 0) return false;
    if (IGNORED_TOP_LEVEL.has(key) && el.path.split('.').length === 2) return false;
    if (key.includes('.')) return false;
    // Hide id at all nesting levels (infrastructure, read-only)
    if (key === 'id') return false;
    // Hide modifierExtension from form (JSON-only)
    if (key === 'modifierExtension') return false;
    // Hide extension when it has no content and no slices
    if (key === 'extension' && !el.sliceName) {
      const hasSlices = Object.values(elements).some((e) => e.sliceName && e.path === el.path);
      if (hasSlices) return false;
      // For nested backbone elements, hide bare extension field
      if (el.path.split('.').length > 2) return false;
    }
    return true;
  });
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function parseElement(raw: RawElement, _rootPath: string): InternalSchemaElement {
  const path = raw.path ?? '';
  const name = lastSegment(path);
  const maxStr = raw.max ?? '0';
  const max = maxStr === '*' ? -1 : parseInt(maxStr, 10);
  const min = raw.min ?? 0;

  const types: TypeInfo[] = (raw.type ?? []).map((t) => ({
    code: t.code ?? '',
    profile: t.profile,
    targetProfile: t.targetProfile,
  }));

  const binding = parseBinding(raw.binding);
  const constraints = parseConstraints(raw.constraint);
  const slicing = parseSlicing(raw.slicing);
  const fixed = extractFixed(raw);
  const pattern = extractPattern(raw);

  return {
    id: raw.id ?? path,
    path,
    name,
    min,
    max,
    isArray: max === -1 || max > 1,
    type: types,
    binding,
    description: raw.short ?? raw.definition,
    isModifier: raw.isModifier ?? false,
    isSummary: raw.isSummary ?? false,
    mustSupport: raw.mustSupport ?? false,
    fixed,
    pattern,
    readonly: READONLY_PROPERTIES.has(name),
    constraints,
    slicing,
    sliceName: raw.sliceName,
  };
}

function parseBinding(raw: RawElement['binding']): BindingDef | undefined {
  if (!raw?.strength) return undefined;
  return {
    strength: raw.strength as BindingDef['strength'],
    valueSet: raw.valueSet,
  };
}

function parseConstraints(raw: RawElement['constraint']): ConstraintDef[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  return raw
    .filter((c) => c.key)
    .map((c) => ({
      key: c.key!,
      human: c.human ?? '',
      severity: (c.severity as ConstraintDef['severity']) ?? 'error',
    }));
}

function parseSlicing(raw: RawElement['slicing']): SlicingDef | undefined {
  if (!raw) return undefined;
  return {
    discriminator: (raw.discriminator ?? []).map((d) => ({
      type: d.type ?? 'value',
      path: d.path ?? '',
    })),
    rules: raw.rules ?? 'open',
    ordered: raw.ordered ?? false,
  };
}

function extractFixed(raw: RawElement): unknown {
  for (const key of Object.keys(raw)) {
    if (key.startsWith('fixed') && key !== 'fixed') {
      return raw[key];
    }
  }
  return undefined;
}

function extractPattern(raw: RawElement): unknown {
  for (const key of Object.keys(raw)) {
    if (key.startsWith('pattern') && key !== 'pattern') {
      return raw[key];
    }
  }
  return undefined;
}

function isDirectChild(parentPath: string, childPath: string): boolean {
  if (!childPath.startsWith(parentPath + '.')) return false;
  const remainder = childPath.slice(parentPath.length + 1);
  return !remainder.includes('.');
}

function lastSegment(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1];
}
