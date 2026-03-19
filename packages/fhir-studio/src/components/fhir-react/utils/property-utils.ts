/**
 * Property value access and mutation utilities for FHIR resource objects.
 *
 * @module fhir-react/utils/property-utils
 */

/**
 * Get a nested value from an object by dot-separated path.
 */
export function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a property on an object, returning a new shallow copy.
 * Handles choice type renaming (e.g. value[x] → valueString).
 */
export function setPropertyValue(
  obj: Record<string, unknown>,
  key: string,
  propName: string,
  value: unknown,
): Record<string, unknown> {
  const result = { ...obj };

  // If the key contains [x], remove any existing choice keys before setting
  if (key.includes('[x]')) {
    const baseName = key.replace('[x]', '');
    for (const existingKey of Object.keys(result)) {
      if (existingKey.startsWith(baseName) && existingKey !== propName) {
        delete result[existingKey];
      }
    }
  }

  if (value === undefined || value === '' || value === null) {
    delete result[propName];
  } else {
    result[propName] = value;
  }

  return result;
}
