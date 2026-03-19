/**
 * ResourcePropertyInput — the type dispatch layer.
 *
 * Given an InternalSchemaElement, determines the correct input component:
 * 1. If array → ArrayInput wrapper
 * 2. If multiple types → ChoiceTypeSelector
 * 3. Otherwise → switch on type code to pick the right input
 *
 * @module fhir-react/ResourcePropertyInput
 */

import type { JSX } from 'react';
import type { InternalSchemaElement } from '../types/schema-types';
import { isComplexType, capitalize } from '../utils/type-utils';
import { ArrayInput } from '../ArrayInput/ArrayInput';
import { ChoiceTypeSelector } from '../ChoiceTypeSelector/ChoiceTypeSelector';
import { BackboneElementInput } from '../BackboneElementInput/BackboneElementInput';
import { TextInput } from '../../ui/TextInput';
import { NumberInput } from '../../ui/NumberInput';
import { TextareaInput } from '../../ui/TextareaInput';
import { CheckboxInput } from '../../ui/CheckboxInput';
import { DateInput } from '../../ui/DateInput';

// Lazy imports for FHIR-specific inputs (will be created in Phase 9D)
// For now we use inline simple implementations or fallback to TextInput
import { CodeInput } from '../inputs/CodeInput';
import { ReferenceInput } from '../inputs/ReferenceInput';
import { CodingInput } from '../inputs/CodingInput';
import { CodeableConceptInput } from '../inputs/CodeableConceptInput';
import { QuantityInput } from '../inputs/QuantityInput';
import { PeriodInput } from '../inputs/PeriodInput';
import { HumanNameInput } from '../inputs/HumanNameInput';
import { AddressInput } from '../inputs/AddressInput';
import { ContactPointInput } from '../inputs/ContactPointInput';
import { IdentifierInput } from '../inputs/IdentifierInput';
import { ExtensionInput } from '../inputs/ExtensionInput';

export interface ResourcePropertyInputProps {
  element: InternalSchemaElement;
  path: string;
  value: unknown;
  onChange: (value: unknown, propName?: string) => void;
  arrayElement?: boolean;
  disabled?: boolean;
}

export function ResourcePropertyInput(props: ResourcePropertyInputProps): JSX.Element {
  const { element, path, value, onChange, disabled } = props;
  const typeCode = element.type[0]?.code ?? '';

  // 1. Array check (skip if already inside array rendering)
  if (element.isArray && !props.arrayElement) {
    return (
      <ArrayInput
        element={element}
        path={path}
        value={value as unknown[]}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  // 2. Multi-type choice[x]
  if (element.type.length > 1) {
    return (
      <ChoiceTypeSelector
        element={element}
        path={path}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  // 3. Single type dispatch
  const handleStringChange = (v: string) => {
    const propName = element.name.includes('[x]')
      ? element.name.replace('[x]', capitalize(typeCode))
      : element.name;
    onChange(v || undefined, propName);
  };

  const handleValueChange = (v: unknown) => {
    const propName = element.name.includes('[x]')
      ? element.name.replace('[x]', capitalize(typeCode))
      : element.name;
    onChange(v, propName);
  };

  switch (typeCode) {
    // ── Primitives ──────────────────────────────────────────────────────────
    case 'string':
    case 'uri':
    case 'url':
    case 'canonical':
    case 'oid':
    case 'uuid':
    case 'id':
      return (
        <TextInput
          value={(value as string) ?? ''}
          onChange={handleStringChange}
          placeholder={element.description}
          disabled={disabled || element.readonly}
        />
      );

    case 'boolean':
      return (
        <CheckboxInput
          checked={Boolean(value)}
          onChange={(checked) => handleValueChange(checked)}
          disabled={disabled || element.readonly}
        />
      );

    case 'integer':
    case 'positiveInt':
    case 'unsignedInt':
      return (
        <NumberInput
          value={value != null ? Number(value) : undefined}
          step={1}
          onChange={(num) => handleValueChange(num)}
          placeholder={element.description}
          disabled={disabled || element.readonly}
        />
      );

    case 'decimal':
      return (
        <NumberInput
          value={value != null ? Number(value) : undefined}
          step="any"
          onChange={(num) => handleValueChange(num)}
          placeholder={element.description}
          disabled={disabled || element.readonly}
        />
      );

    case 'date':
      return (
        <DateInput
          inputType="date"
          value={(value as string) ?? ''}
          onChange={handleStringChange}
          disabled={disabled || element.readonly}
        />
      );

    case 'dateTime':
    case 'instant':
      return (
        <DateInput
          inputType="datetime-local"
          value={(value as string) ?? ''}
          onChange={handleStringChange}
          disabled={disabled || element.readonly}
        />
      );

    case 'time':
      return (
        <DateInput
          inputType="time"
          value={(value as string) ?? ''}
          onChange={handleStringChange}
          disabled={disabled || element.readonly}
        />
      );

    case 'code':
      return element.binding ? (
        <CodeInput
          binding={element.binding}
          value={(value as string) ?? ''}
          onChange={handleStringChange}
          disabled={disabled || element.readonly}
        />
      ) : (
        <TextInput
          value={(value as string) ?? ''}
          onChange={handleStringChange}
          placeholder={element.description}
          disabled={disabled || element.readonly}
        />
      );

    case 'markdown':
    case 'base64Binary':
    case 'xhtml':
      return (
        <TextareaInput
          value={(value as string) ?? ''}
          onChange={handleStringChange}
          placeholder={element.description}
          disabled={disabled || element.readonly}
        />
      );

    // ── Complex types ───────────────────────────────────────────────────────
    case 'CodeableConcept':
      return (
        <CodeableConceptInput
          value={value as Record<string, unknown>}
          onChange={handleValueChange}
          binding={element.binding}
          disabled={disabled}
        />
      );

    case 'Coding':
      return (
        <CodingInput
          value={value as Record<string, unknown>}
          onChange={handleValueChange}
          binding={element.binding}
          disabled={disabled}
        />
      );

    case 'Reference':
      return (
        <ReferenceInput
          value={value as Record<string, unknown>}
          onChange={handleValueChange}
          targetTypes={element.type[0]?.targetProfile}
          disabled={disabled}
        />
      );

    case 'HumanName':
      return (
        <HumanNameInput
          value={value as Record<string, unknown>}
          onChange={handleValueChange}
          disabled={disabled}
        />
      );

    case 'Address':
      return (
        <AddressInput
          value={value as Record<string, unknown>}
          onChange={handleValueChange}
          disabled={disabled}
        />
      );

    case 'ContactPoint':
      return (
        <ContactPointInput
          value={value as Record<string, unknown>}
          onChange={handleValueChange}
          disabled={disabled}
        />
      );

    case 'Identifier':
      return (
        <IdentifierInput
          value={value as Record<string, unknown>}
          onChange={handleValueChange}
          disabled={disabled}
        />
      );

    case 'Quantity':
    case 'Duration':
      return (
        <QuantityInput
          value={value as Record<string, unknown>}
          onChange={handleValueChange}
          disabled={disabled}
        />
      );

    case 'Period':
      return (
        <PeriodInput
          value={value as Record<string, unknown>}
          onChange={handleValueChange}
          disabled={disabled}
        />
      );

    case 'Extension':
      return (
        <ExtensionInput
          value={value as Record<string, unknown>}
          onChange={handleValueChange}
          element={element}
          path={path}
          disabled={disabled}
        />
      );

    // ── Fallback: unknown complex → BackboneElementInput ────────────────────
    default:
      if (isComplexType(typeCode)) {
        return (
          <BackboneElementInput
            typeName={typeCode}
            path={path}
            value={value as Record<string, unknown>}
            onChange={handleValueChange}
          />
        );
      }
      return (
        <TextInput
          value={String(value ?? '')}
          onChange={handleStringChange}
          placeholder={`${typeCode} (unsupported type)`}
          disabled={disabled || element.readonly}
        />
      );
  }
}
