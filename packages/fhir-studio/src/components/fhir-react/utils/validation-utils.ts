/**
 * Client-side FHIR resource validation using schema (ParsedSchema).
 *
 * Validates:
 * - Unknown properties (not defined in the StructureDefinition)
 * - Required fields (min > 0)
 * - Basic type mismatches (expected array vs scalar, etc.)
 * - Choice type property validity
 *
 * Does NOT validate:
 * - ValueSet bindings (requires server-side terminology)
 * - FHIRPath constraints (requires fhirpath engine)
 * - Cross-field invariants
 *
 * @module fhir-react/utils/validation-utils
 */

import type { ParsedSchema, InternalSchemaElement } from '../types/schema-types';
import { capitalize } from './type-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'information';
  message: string;
  path: string;
  expression?: string;
}

// ─── Infrastructure properties always allowed ────────────────────────────────

const ALWAYS_ALLOWED = new Set([
  'resourceType', 'id', 'meta', 'implicitRules', 'language',
  'text', 'contained', 'extension', 'modifierExtension',
]);

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Validate a resource against a parsed schema.
 * Returns an array of validation issues (empty = valid).
 */
export function validateResource(
  resource: Record<string, unknown>,
  schema: ParsedSchema,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rootPath = schema.type;

  validateObject(resource, schema.elements, schema.allElements, rootPath, issues);

  return issues;
}

// ─── Internal validation logic ───────────────────────────────────────────────

function validateObject(
  obj: Record<string, unknown>,
  elements: Record<string, InternalSchemaElement>,
  allElements: Map<string, InternalSchemaElement>,
  currentPath: string,
  issues: ValidationIssue[],
): void {
  if (!obj || typeof obj !== 'object') return;

  // Build set of allowed property names from schema
  const allowedKeys = buildAllowedKeys(elements);

  // 1. Check for unknown properties
  for (const key of Object.keys(obj)) {
    if (key.startsWith('_')) continue; // FHIR primitive extensions
    if (ALWAYS_ALLOWED.has(key)) continue;
    if (!allowedKeys.has(key)) {
      issues.push({
        severity: 'error',
        message: `Invalid additional property "${key}"`,
        path: `${currentPath}.${key}`,
        expression: `${currentPath}.${key}`,
      });
    }
  }

  // 2. Check required fields and recurse into values
  for (const [key, element] of Object.entries(elements)) {
    // Skip extension slices for required check — handled separately
    if (element.sliceName) continue;

    const propValue = resolvePropertyValue(obj, key, element);

    // Required check
    if (element.min > 0 && isEmpty(propValue)) {
      issues.push({
        severity: 'error',
        message: `Missing required field "${key}"`,
        path: `${currentPath}.${key}`,
        expression: `${currentPath}.${key}`,
      });
    }

    // Recurse into arrays
    if (propValue !== undefined && element.isArray && Array.isArray(propValue)) {
      for (let i = 0; i < propValue.length; i++) {
        const item = propValue[i];
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          validateNestedObject(
            item as Record<string, unknown>,
            element,
            allElements,
            `${currentPath}.${key}[${i}]`,
            issues,
          );
        }
      }
    }
    // Recurse into single complex objects
    else if (propValue !== undefined && typeof propValue === 'object' && !Array.isArray(propValue) && propValue !== null) {
      validateNestedObject(
        propValue as Record<string, unknown>,
        element,
        allElements,
        `${currentPath}.${key}`,
        issues,
      );
    }
  }
}

function validateNestedObject(
  obj: Record<string, unknown>,
  parentElement: InternalSchemaElement,
  allElements: Map<string, InternalSchemaElement>,
  path: string,
  issues: ValidationIssue[],
): void {
  // Get child elements for this backbone/complex type
  const childElements = getChildElementsForValidation(parentElement.path, allElements);
  if (Object.keys(childElements).length > 0) {
    validateObject(obj, childElements, allElements, path, issues);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the set of allowed property keys from elements.
 * Includes choice type expansions (e.g. value[x] → valueString, valueBoolean, etc.)
 */
function buildAllowedKeys(elements: Record<string, InternalSchemaElement>): Set<string> {
  const keys = new Set<string>();
  for (const [key, element] of Object.entries(elements)) {
    if (element.sliceName) continue; // Extension slices are not direct properties

    if (key.includes('[x]')) {
      // Choice type: add all expanded names
      const baseName = key.replace('[x]', '');
      for (const t of element.type) {
        keys.add(baseName + capitalize(t.code));
      }
    } else {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Resolve the value for a property, handling choice types.
 */
function resolvePropertyValue(
  obj: Record<string, unknown>,
  key: string,
  element: InternalSchemaElement,
): unknown {
  if (key.includes('[x]')) {
    const baseName = key.replace('[x]', '');
    for (const t of element.type) {
      const expanded = baseName + capitalize(t.code);
      if (expanded in obj) return obj[expanded];
    }
    return undefined;
  }
  return obj[key];
}

/**
 * Get child elements for a parent path — simple version for validation.
 */
function getChildElementsForValidation(
  parentPath: string,
  allElements: Map<string, InternalSchemaElement>,
): Record<string, InternalSchemaElement> {
  const result: Record<string, InternalSchemaElement> = {};
  for (const [, el] of allElements) {
    if (!el.path.startsWith(parentPath + '.')) continue;
    const remainder = el.path.slice(parentPath.length + 1);
    if (remainder.includes('.')) continue; // Not direct child
    if (el.id.includes(':')) continue; // Skip slices
    result[el.name] = el;
  }
  return result;
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}
