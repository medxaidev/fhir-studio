/**
 * React Context for passing schema element definitions down the component tree.
 *
 * Used by BackboneElementInput → ElementsInput → ResourcePropertyInput
 * to know which elements to render at each recursion level.
 *
 * @module fhir-react/context/SchemaContext
 */

import { createContext } from 'react';
import type { InternalSchemaElement } from '../types/schema-types';
import type { SchemaService } from '../../../services/schema-service';

export interface ElementsContextType {
  path: string;
  profileUrl?: string;
  elements: Record<string, InternalSchemaElement>;
  allElements: Map<string, InternalSchemaElement>;
}

export const ElementsContext = createContext<ElementsContextType>({
  path: '',
  profileUrl: undefined,
  elements: {},
  allElements: new Map(),
});

ElementsContext.displayName = 'ElementsContext';

export const SchemaServiceContext = createContext<SchemaService | null>(null);
SchemaServiceContext.displayName = 'SchemaServiceContext';
