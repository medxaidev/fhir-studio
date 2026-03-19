/**
 * ig-tree-builder.ts
 *
 * Transforms a CanonicalProfile (from fhir-runtime) into a TreeNode[]
 * hierarchy suitable for UI rendering. This is the ONLY file (along with
 * ig-service.ts) that imports fhir-runtime.
 *
 * @module fhir-studio/lib/ig-tree-builder
 */

import {
  isChoiceType,
  getChoiceBaseName,
  buildChoiceJsonKey,
  isBackboneElement,
  isExtensionSlicing,
  getBackboneChildren,
} from 'fhir-runtime';

import type {
  TreeNode,
  ElementTreeNode,
  SliceTreeNode,
  ExtensionTreeNode,
  ChoiceTreeNode,
  BackboneTreeNode,
  ChoiceVariant,
  BindingInfo,
  ConstraintInfo,
} from './ig-tree-types';

// ---------------------------------------------------------------------------
// Public types re-exported for convenience
// ---------------------------------------------------------------------------

export type { TreeNode } from './ig-tree-types';

// ---------------------------------------------------------------------------
// fhir-runtime type aliases (kept local to avoid leaking into UI)
// ---------------------------------------------------------------------------

interface CanonicalElement {
  path: string;
  id: string;
  min: number;
  max: number | 'unbounded';
  types: Array<{ code: string; profiles?: string[]; targetProfiles?: string[] }>;
  binding?: { strength: string; valueSetUrl: string };
  constraints: Array<{ key: string; human: string }>;
  slicing?: {
    discriminators: Array<{ type: string; path: string }>;
    rules: string;
    ordered: boolean;
    description?: string;
  };
  mustSupport: boolean;
  isModifier: boolean;
  isSummary: boolean;
}

interface SliceDefinition {
  id: string;
  sliceName: string;
  basePath: string;
  min: number;
  max: number | 'unbounded';
  fixedValues: Record<string, unknown>;
  mustSupport: boolean;
  extensionUrl?: string;
  extensionProfile?: string;
}

interface SlicedElement {
  basePath: string;
  discriminators: Array<{ type: string; path: string }>;
  rules: string;
  ordered: boolean;
  description?: string;
  slices: SliceDefinition[];
}

interface CanonicalProfile {
  url: string;
  version?: string;
  name: string;
  kind: string;
  type: string;
  baseProfile?: string;
  abstract?: boolean;
  derivation?: string;
  elements: Map<string, CanonicalElement>;
  slicing?: Map<string, SlicedElement>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMax(max: number | 'unbounded'): string {
  return max === 'unbounded' ? '*' : String(max);
}

function lastSegment(path: string): string {
  const parts = path.split('.');
  return parts[parts.length - 1];
}

function extractBinding(el: CanonicalElement): BindingInfo | undefined {
  if (!el.binding) return undefined;
  return {
    strength: el.binding.strength as BindingInfo['strength'],
    valueSetUrl: el.binding.valueSetUrl,
  };
}

function typeCodeDisplay(el: CanonicalElement): string {
  if (el.types.length === 0) return '';
  if (el.types.length === 1) return el.types[0].code;
  return el.types.map((t) => t.code).join(' | ');
}

function isDirectChild(parentPath: string, childPath: string): boolean {
  if (!childPath.startsWith(parentPath + '.')) return false;
  const remainder = childPath.slice(parentPath.length + 1);
  return !remainder.includes('.');
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildTree(profile: CanonicalProfile): TreeNode[] {
  const rootPath = profile.type;
  const rootElement = profile.elements.get(rootPath);
  if (!rootElement) return [];

  const children = buildChildNodes(rootPath, profile, 0);
  return children;
}

function buildChildNodes(
  parentPath: string,
  profile: CanonicalProfile,
  depth: number,
): TreeNode[] {
  const nodes: TreeNode[] = [];

  // Collect direct children from elements map
  const directChildren: CanonicalElement[] = [];
  for (const [, el] of profile.elements) {
    if (isDirectChild(parentPath, el.path)) {
      directChildren.push(el);
    }
  }

  for (const el of directChildren) {
    const node = buildNodeForElement(el, profile, depth);
    if (node) nodes.push(node);
  }

  return nodes;
}

function buildNodeForElement(
  el: CanonicalElement,
  profile: CanonicalProfile,
  depth: number,
): TreeNode | null {
  // Choice type: value[x]
  if (isChoiceType(el as never)) {
    return buildChoiceNode(el, profile, depth);
  }

  // BackboneElement
  if (isBackboneElement(el as never)) {
    return buildBackboneNode(el, profile, depth);
  }

  // Extension with slicing
  if (
    el.slicing &&
    isExtensionSlicing(el.path)
  ) {
    return buildExtensionGroupNode(el, profile, depth);
  }

  // Regular sliced element (non-extension)
  if (el.slicing && profile.slicing?.has(el.path)) {
    return buildSlicedElementNode(el, profile, depth);
  }

  // Plain element
  return buildElementNode(el, profile, depth);
}

// ---------------------------------------------------------------------------
// Element node
// ---------------------------------------------------------------------------

function extractConstraints(el: CanonicalElement): ConstraintInfo[] | undefined {
  if (!el.constraints || el.constraints.length === 0) return undefined;
  return el.constraints.map((c) => ({ key: c.key, human: c.human }));
}

function buildElementNode(
  el: CanonicalElement,
  _profile: CanonicalProfile,
  depth: number,
): ElementTreeNode {
  return {
    id: el.id || el.path,
    kind: 'element',
    path: el.path,
    label: lastSegment(el.path),
    depth,
    hasChildren: false,
    typeCode: typeCodeDisplay(el),
    min: el.min,
    max: formatMax(el.max),
    mustSupport: el.mustSupport,
    binding: extractBinding(el),
    constraints: extractConstraints(el),
  };
}

// ---------------------------------------------------------------------------
// Choice node
// ---------------------------------------------------------------------------

function buildChoiceNode(
  el: CanonicalElement,
  _profile: CanonicalProfile,
  depth: number,
): ChoiceTreeNode {
  const baseName = getChoiceBaseName(el.path);
  const variants: ChoiceVariant[] = el.types.map((t) => ({
    typeCode: t.code,
    jsonKey: buildChoiceJsonKey(baseName, t.code),
  }));

  return {
    id: el.id || el.path,
    kind: 'choice',
    path: el.path,
    label: lastSegment(el.path),
    depth,
    hasChildren: false,
    baseName,
    variants,
    min: el.min,
    max: formatMax(el.max),
    mustSupport: el.mustSupport,
    binding: extractBinding(el),
  };
}

// ---------------------------------------------------------------------------
// Backbone node
// ---------------------------------------------------------------------------

function buildBackboneNode(
  el: CanonicalElement,
  profile: CanonicalProfile,
  depth: number,
): BackboneTreeNode {
  const backboneChildren = getBackboneChildren(el.path, profile as never);
  const children: TreeNode[] = [];

  for (const child of backboneChildren as CanonicalElement[]) {
    const node = buildNodeForElement(child, profile, depth + 1);
    if (node) children.push(node);
  }

  return {
    id: el.id || el.path,
    kind: 'backbone',
    path: el.path,
    label: lastSegment(el.path),
    depth,
    hasChildren: children.length > 0,
    children: children.length > 0 ? children : undefined,
    min: el.min,
    max: formatMax(el.max),
    mustSupport: el.mustSupport,
  };
}

// ---------------------------------------------------------------------------
// Sliced element node (non-extension)
// ---------------------------------------------------------------------------

function buildSlicedElementNode(
  el: CanonicalElement,
  profile: CanonicalProfile,
  depth: number,
): ElementTreeNode {
  const slicedElement = profile.slicing!.get(el.path)!;

  // Build slice children
  const sliceChildren: TreeNode[] = slicedElement.slices.map((slice) =>
    buildSliceNode(slice, slicedElement, depth + 1),
  );

  return {
    id: el.id || el.path,
    kind: 'element',
    path: el.path,
    label: lastSegment(el.path),
    depth,
    hasChildren: sliceChildren.length > 0,
    children: sliceChildren.length > 0 ? sliceChildren : undefined,
    typeCode: typeCodeDisplay(el),
    min: el.min,
    max: formatMax(el.max),
    mustSupport: el.mustSupport,
    binding: extractBinding(el),
    constraints: extractConstraints(el),
  };
}

function buildSliceNode(
  slice: SliceDefinition,
  slicedElement: SlicedElement,
  depth: number,
): SliceTreeNode {
  const disc = slicedElement.discriminators[0];
  return {
    id: slice.id,
    kind: 'slice',
    path: slice.basePath,
    label: `:${slice.sliceName}`,
    depth,
    hasChildren: false,
    sliceName: slice.sliceName,
    discriminatorType: disc?.type ?? 'unknown',
    discriminatorPath: disc?.path ?? '',
    slicingRules: slicedElement.rules,
    min: slice.min,
    max: formatMax(slice.max),
    mustSupport: slice.mustSupport,
    fixedValues:
      Object.keys(slice.fixedValues).length > 0
        ? slice.fixedValues
        : undefined,
  };
}

// ---------------------------------------------------------------------------
// Extension group node
// ---------------------------------------------------------------------------

function buildExtensionGroupNode(
  el: CanonicalElement,
  profile: CanonicalProfile,
  depth: number,
): ElementTreeNode {
  const slicedElement = profile.slicing?.get(el.path);
  const extChildren: TreeNode[] = [];

  if (slicedElement) {
    for (const slice of slicedElement.slices) {
      extChildren.push(buildExtensionSliceNode(slice, depth + 1));
    }
  }

  return {
    id: el.id || el.path,
    kind: 'element',
    path: el.path,
    label: lastSegment(el.path),
    depth,
    hasChildren: extChildren.length > 0,
    children: extChildren.length > 0 ? extChildren : undefined,
    typeCode: 'Extension',
    min: el.min,
    max: formatMax(el.max),
    mustSupport: el.mustSupport,
  };
}

function buildExtensionSliceNode(
  slice: SliceDefinition,
  depth: number,
): ExtensionTreeNode {
  const extUrl = slice.extensionUrl ?? '';
  const hasValue = !!slice.fixedValues && Object.keys(slice.fixedValues).length > 0;

  // Determine extension kind:
  // - simple: has extensionUrl, no nested extension children
  // - complex: has extensionProfile
  // - nested: extension within extension (depth heuristic)
  let extensionKind: 'simple' | 'complex' | 'nested' = 'simple';
  if (slice.extensionProfile) {
    extensionKind = 'complex';
  }

  return {
    id: slice.id,
    kind: 'extension',
    path: slice.basePath,
    label: slice.sliceName,
    depth,
    hasChildren: false,
    extensionUrl: extUrl,
    extensionKind,
    min: slice.min,
    max: formatMax(slice.max),
    mustSupport: slice.mustSupport,
    valueType: hasValue ? Object.keys(slice.fixedValues)[0] : undefined,
  };
}
