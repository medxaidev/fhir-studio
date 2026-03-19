/**
 * BackboneElementInput — the recursive layer.
 *
 * Builds an ElementsContext for the given type/path and renders
 * ElementsInput with the child elements.
 *
 * @module fhir-react/BackboneElementInput
 */

import { useContext, useMemo } from 'react';
import type { JSX } from 'react';
import { ElementsContext } from '../context/SchemaContext';
import { ElementsInput } from '../ElementsInput/ElementsInput';
import { getChildElements } from '../utils/schema-utils';
import { Fieldset } from '../../ui/Fieldset';
import styles from './BackboneElementInput.module.css';

export interface BackboneElementInputProps {
  typeName: string;
  path: string;
  value: Record<string, unknown>;
  onChange: (value: unknown) => void;
  profileUrl?: string;
}

export function BackboneElementInput({
  typeName,
  path,
  value,
  onChange,
  profileUrl,
}: BackboneElementInputProps): JSX.Element {
  const parentCtx = useContext(ElementsContext);
  const isNested = parentCtx.path !== '';

  // Strip array indices from path for element lookup
  // e.g. Patient.contact[0] → Patient.contact
  const canonicalPath = path.replace(/\[\d+\]/g, '');

  const childElements = useMemo(() => {
    return getChildElements(canonicalPath, parentCtx.allElements);
  }, [canonicalPath, parentCtx.allElements]);

  const contextValue = useMemo(() => ({
    path,
    profileUrl: profileUrl ?? parentCtx.profileUrl,
    elements: childElements,
    allElements: parentCtx.allElements,
  }), [path, profileUrl, parentCtx.profileUrl, childElements, parentCtx.allElements]);

  if (Object.keys(childElements).length === 0) {
    return <div className={styles.empty}>{typeName} — no elements</div>;
  }

  const content = (
    <ElementsContext.Provider value={contextValue}>
      <ElementsInput
        type={typeName}
        path={path}
        defaultValue={value ?? {}}
        onChange={(v) => onChange(v)}
      />
    </ElementsContext.Provider>
  );

  if (isNested) {
    return (
      <Fieldset legend={typeName}>
        {content}
      </Fieldset>
    );
  }

  return content;
}
