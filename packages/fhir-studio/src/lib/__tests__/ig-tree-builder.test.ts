import { describe, it, expect } from 'vitest';
import { buildCanonicalProfile } from 'fhir-runtime';
import { buildTree } from '../ig-tree-builder';

/**
 * Minimal StructureDefinition fixture with:
 * - Regular element (status)
 * - Choice type (value[x])
 * - BackboneElement (component) with children
 * - Extension slicing (extension:race)
 * - Regular slicing (category:VSCat)
 */
const TEST_SD = {
  resourceType: 'StructureDefinition',
  url: 'http://test/Observation',
  name: 'TestObservation',
  kind: 'resource',
  type: 'Obs',
  baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Observation',
  snapshot: {
    element: [
      { id: 'Obs', path: 'Obs', min: 0, max: '*', type: [{ code: 'Observation' }] },
      {
        id: 'Obs.status',
        path: 'Obs.status',
        min: 1,
        max: '1',
        type: [{ code: 'code' }],
        mustSupport: true,
        binding: { strength: 'required', valueSet: 'http://hl7.org/fhir/ValueSet/observation-status' },
      },
      {
        id: 'Obs.value[x]',
        path: 'Obs.value[x]',
        min: 0,
        max: '1',
        type: [{ code: 'Quantity' }, { code: 'string' }, { code: 'CodeableConcept' }],
      },
      {
        id: 'Obs.component',
        path: 'Obs.component',
        min: 0,
        max: '*',
        type: [{ code: 'BackboneElement' }],
      },
      {
        id: 'Obs.component.code',
        path: 'Obs.component.code',
        min: 1,
        max: '1',
        type: [{ code: 'CodeableConcept' }],
      },
      {
        id: 'Obs.component.value[x]',
        path: 'Obs.component.value[x]',
        min: 0,
        max: '1',
        type: [{ code: 'Quantity' }, { code: 'string' }],
      },
      {
        id: 'Obs.extension',
        path: 'Obs.extension',
        min: 0,
        max: '*',
        type: [{ code: 'Extension' }],
        slicing: { discriminator: [{ type: 'value', path: 'url' }], rules: 'open' },
      },
      {
        id: 'Obs.extension:race',
        path: 'Obs.extension',
        sliceName: 'race',
        min: 0,
        max: '1',
        type: [{ code: 'Extension', profile: ['http://example.com/ext/race'] }],
      },
      {
        id: 'Obs.category',
        path: 'Obs.category',
        min: 1,
        max: '*',
        type: [{ code: 'CodeableConcept' }],
        slicing: { discriminator: [{ type: 'pattern', path: '$this' }], rules: 'open' },
      },
      {
        id: 'Obs.category:VSCat',
        path: 'Obs.category',
        sliceName: 'VSCat',
        min: 1,
        max: '1',
        type: [{ code: 'CodeableConcept' }],
        patternCodeableConcept: { coding: [{ system: 'http://term', code: 'vital-signs' }] },
      },
    ],
  },
};

describe('ig-tree-builder', () => {
  const profile = buildCanonicalProfile(TEST_SD as never);
  const tree = buildTree(profile as never);

  it('produces a non-empty tree', () => {
    expect(tree.length).toBeGreaterThan(0);
  });

  it('contains an element node for status', () => {
    const status = tree.find((n) => n.path === 'Obs.status');
    expect(status).toBeDefined();
    expect(status!.kind).toBe('element');
    if (status!.kind === 'element') {
      expect(status!.typeCode).toBe('code');
      expect(status!.min).toBe(1);
      expect(status!.max).toBe('1');
      expect(status!.mustSupport).toBe(true);
      expect(status!.binding).toBeDefined();
      expect(status!.binding!.strength).toBe('required');
    }
  });

  it('contains a choice node for value[x]', () => {
    const choice = tree.find((n) => n.path === 'Obs.value[x]');
    expect(choice).toBeDefined();
    expect(choice!.kind).toBe('choice');
    if (choice!.kind === 'choice') {
      expect(choice!.baseName).toBe('value');
      expect(choice!.variants.length).toBe(3);
      expect(choice!.variants.map((v) => v.typeCode)).toContain('Quantity');
      expect(choice!.variants.map((v) => v.typeCode)).toContain('string');
      expect(choice!.variants.map((v) => v.jsonKey)).toContain('valueQuantity');
      expect(choice!.variants.map((v) => v.jsonKey)).toContain('valueString');
    }
  });

  it('contains a backbone node for component with children', () => {
    const comp = tree.find((n) => n.path === 'Obs.component');
    expect(comp).toBeDefined();
    expect(comp!.kind).toBe('backbone');
    expect(comp!.hasChildren).toBe(true);
    expect(comp!.children).toBeDefined();
    expect(comp!.children!.length).toBeGreaterThanOrEqual(2);

    // Child: code
    const code = comp!.children!.find((c) => c.path === 'Obs.component.code');
    expect(code).toBeDefined();

    // Child: value[x] (choice within backbone)
    const childChoice = comp!.children!.find((c) => c.path === 'Obs.component.value[x]');
    expect(childChoice).toBeDefined();
    expect(childChoice!.kind).toBe('choice');
  });

  it('contains extension slicing with extension child', () => {
    const ext = tree.find((n) => n.path === 'Obs.extension');
    expect(ext).toBeDefined();
    expect(ext!.hasChildren).toBe(true);
    expect(ext!.children).toBeDefined();

    const race = ext!.children!.find((c) => c.kind === 'extension');
    expect(race).toBeDefined();
    if (race && race.kind === 'extension') {
      expect(race.extensionUrl).toBe('http://example.com/ext/race');
      expect(race.label).toBe('race');
    }
  });

  it('contains regular slicing for category with slice child', () => {
    const cat = tree.find((n) => n.path === 'Obs.category');
    expect(cat).toBeDefined();
    expect(cat!.hasChildren).toBe(true);
    expect(cat!.children).toBeDefined();

    const vscat = cat!.children!.find((c) => c.kind === 'slice');
    expect(vscat).toBeDefined();
    if (vscat && vscat.kind === 'slice') {
      expect(vscat.sliceName).toBe('VSCat');
      expect(vscat.discriminatorType).toBe('pattern');
      expect(vscat.min).toBe(1);
      expect(vscat.max).toBe('1');
    }
  });

  it('all nodes have required base fields', () => {
    function checkNode(node: (typeof tree)[0]) {
      expect(node.id).toBeTruthy();
      expect(node.kind).toBeTruthy();
      expect(node.path).toBeTruthy();
      expect(node.label).toBeTruthy();
      expect(typeof node.depth).toBe('number');
      expect(typeof node.hasChildren).toBe('boolean');

      if (node.children) {
        for (const child of node.children) {
          checkNode(child);
        }
      }
    }

    for (const node of tree) {
      checkNode(node);
    }
  });
});
