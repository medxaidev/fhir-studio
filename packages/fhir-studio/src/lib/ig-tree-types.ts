/**
 * TreeNode type system for the IG Explorer element tree.
 *
 * These types are the UI-facing data model — they contain only
 * serializable, pre-processed data. No fhir-runtime types leak here.
 */

export type TreeNodeKind = 'element' | 'slice' | 'extension' | 'choice' | 'backbone';

export interface TreeNodeBase {
  id: string;
  kind: TreeNodeKind;
  path: string;
  label: string;
  depth: number;
  hasChildren: boolean;
  children?: TreeNode[];
  isExpanded?: boolean;
}

export interface ElementTreeNode extends TreeNodeBase {
  kind: 'element';
  typeCode: string;
  min: number;
  max: string;
  mustSupport: boolean;
  fixedValue?: unknown;
  patternValue?: unknown;
  binding?: BindingInfo;
  description?: string;
}

export interface SliceTreeNode extends TreeNodeBase {
  kind: 'slice';
  sliceName: string;
  discriminatorType: string;
  discriminatorPath: string;
  slicingRules: string;
  min: number;
  max: string;
  mustSupport: boolean;
  fixedValues?: Record<string, unknown>;
}

export interface ExtensionTreeNode extends TreeNodeBase {
  kind: 'extension';
  extensionUrl: string;
  extensionKind: 'simple' | 'complex' | 'nested';
  min: number;
  max: string;
  mustSupport: boolean;
  valueType?: string;
}

export interface ChoiceVariant {
  typeCode: string;
  jsonKey: string;
}

export interface ChoiceTreeNode extends TreeNodeBase {
  kind: 'choice';
  baseName: string;
  variants: ChoiceVariant[];
  min: number;
  max: string;
  mustSupport: boolean;
  binding?: BindingInfo;
}

export interface BackboneTreeNode extends TreeNodeBase {
  kind: 'backbone';
  min: number;
  max: string;
  mustSupport: boolean;
}

export type TreeNode =
  | ElementTreeNode
  | SliceTreeNode
  | ExtensionTreeNode
  | ChoiceTreeNode
  | BackboneTreeNode;

export interface BindingInfo {
  strength: 'required' | 'extensible' | 'preferred' | 'example';
  valueSetUrl: string;
  valueSetName?: string;
}
