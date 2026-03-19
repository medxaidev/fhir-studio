/**
 * Internal schema types for the FHIR form engine.
 *
 * Parsed from StructureDefinition snapshot.element into a UI-friendly format.
 * Similar to Medplum's ExtendedInternalSchemaElement but independent of @medplum/core.
 *
 * @module fhir-react/types/schema-types
 */

export interface InternalSchemaElement {
  id: string;
  path: string;
  name: string;
  min: number;
  max: number;
  isArray: boolean;
  type: TypeInfo[];
  binding?: BindingDef;
  description?: string;
  isModifier: boolean;
  isSummary: boolean;
  mustSupport: boolean;
  fixed?: unknown;
  pattern?: unknown;
  readonly: boolean;
  constraints?: ConstraintDef[];
  slicing?: SlicingDef;
  sliceName?: string;
}

export interface TypeInfo {
  code: string;
  profile?: string[];
  targetProfile?: string[];
}

export interface BindingDef {
  strength: 'required' | 'extensible' | 'preferred' | 'example';
  valueSet?: string;
}

export interface ConstraintDef {
  key: string;
  human: string;
  severity: 'error' | 'warning';
}

export interface SlicingDef {
  discriminator: Array<{ type: string; path: string }>;
  rules: string;
  ordered: boolean;
  slices?: SliceInfo[];
}

export interface SliceInfo {
  name: string;
  min: number;
  max: number;
  elements: Record<string, InternalSchemaElement>;
}

/**
 * Parsed StructureDefinition — cached schema for a resource type.
 */
export interface ParsedSchema {
  url: string;
  type: string;
  name: string;
  baseDefinition?: string;
  elements: Record<string, InternalSchemaElement>;
  allElements: Map<string, InternalSchemaElement>;
}
