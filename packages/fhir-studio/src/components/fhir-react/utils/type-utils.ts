/**
 * FHIR type classification and default value utilities.
 *
 * @module fhir-react/utils/type-utils
 */

const PRIMITIVE_TYPES = new Set([
  'boolean', 'integer', 'integer64', 'string', 'decimal', 'uri', 'url',
  'canonical', 'base64Binary', 'instant', 'date', 'dateTime', 'time',
  'code', 'oid', 'id', 'markdown', 'unsignedInt', 'positiveInt', 'uuid',
  'xhtml',
]);

const COMPLEX_TYPES = new Set([
  'Address', 'Annotation', 'Attachment', 'CodeableConcept', 'Coding',
  'ContactDetail', 'ContactPoint', 'Dosage', 'Duration', 'Extension',
  'HumanName', 'Identifier', 'Money', 'Period', 'Quantity', 'Range',
  'Ratio', 'Reference', 'SampledData', 'Signature', 'Timing',
  'UsageContext', 'Meta', 'Narrative',
]);

export function isPrimitiveType(code: string): boolean {
  return PRIMITIVE_TYPES.has(code);
}

export function isComplexType(code: string): boolean {
  if (COMPLEX_TYPES.has(code)) return true;
  if (PRIMITIVE_TYPES.has(code)) return false;
  // BackboneElement or unknown complex type
  return true;
}

export function isBackboneType(code: string): boolean {
  return code === 'BackboneElement' || code === 'Element';
}

/**
 * Get a sensible default value for a given FHIR type code.
 */
export function getDefaultValue(typeCode: string): unknown {
  switch (typeCode) {
    case 'boolean':
      return false;
    case 'integer':
    case 'positiveInt':
    case 'unsignedInt':
    case 'decimal':
      return undefined;
    case 'string':
    case 'uri':
    case 'url':
    case 'canonical':
    case 'code':
    case 'id':
    case 'oid':
    case 'uuid':
    case 'markdown':
    case 'base64Binary':
    case 'xhtml':
    case 'date':
    case 'dateTime':
    case 'instant':
    case 'time':
      return '';
    default:
      // Complex types default to empty object
      return {};
  }
}

/**
 * Capitalize first letter (for choice type key building, e.g. value + String → valueString).
 */
export function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
