import { useSyncExternalStore } from 'react';
import { igStore } from '../../../stores/ig-store';
import type {
  ElementTreeNode,
  SliceTreeNode,
  ExtensionTreeNode,
  ChoiceTreeNode,
  BackboneTreeNode,
} from '../../../lib/ig-tree-types';
import { Badge } from '../../ui';
import styles from './ElementDetailPanel.module.css';

export function ElementDetailPanel() {
  const state = useSyncExternalStore(igStore.subscribe, igStore.getState);
  const node = igStore.getSelectedNode();

  if (!state.selectedProfileId) {
    return (
      <aside className={styles.panel}>
        <div className={styles.empty}>Select a profile to view details.</div>
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className={styles.panel}>
        <div className={styles.empty}>Click an element in the tree to view its details.</div>
      </aside>
    );
  }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerKind}>{node.kind}</span>
        <h3 className={styles.headerLabel}>{node.label}</h3>
      </div>
      <div className={styles.body}>
        {/* Common fields */}
        <DetailRow label="Path" mono>{node.path}</DetailRow>
        <DetailRow label="ID" mono>{node.id}</DetailRow>

        {/* Kind-specific sections */}
        {node.kind === 'element' && <ElementDetails node={node} />}
        {node.kind === 'slice' && <SliceDetails node={node} />}
        {node.kind === 'extension' && <ExtensionDetails node={node} />}
        {node.kind === 'choice' && <ChoiceDetails node={node} />}
        {node.kind === 'backbone' && <BackboneDetails node={node} />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Kind-specific detail sections
// ---------------------------------------------------------------------------

function ElementDetails({ node }: { node: ElementTreeNode }) {
  return (
    <>
      <DetailRow label="Type">{node.typeCode}</DetailRow>
      <CardinalityRow min={node.min} max={node.max} />
      <MustSupportRow value={node.mustSupport} />
      {node.description && <DetailRow label="Description">{node.description}</DetailRow>}
      {node.binding && <BindingSection binding={node.binding} />}
      {node.fixedValue !== undefined && (
        <DetailRow label="Fixed Value">
          <pre className={styles.jsonBlock}>{JSON.stringify(node.fixedValue, null, 2)}</pre>
        </DetailRow>
      )}
      {node.patternValue !== undefined && (
        <DetailRow label="Pattern Value">
          <pre className={styles.jsonBlock}>{JSON.stringify(node.patternValue, null, 2)}</pre>
        </DetailRow>
      )}
    </>
  );
}

function SliceDetails({ node }: { node: SliceTreeNode }) {
  return (
    <>
      <DetailRow label="Slice Name">{node.sliceName}</DetailRow>
      <CardinalityRow min={node.min} max={node.max} />
      <MustSupportRow value={node.mustSupport} />
      <DetailRow label="Discriminator Type">
        <Badge variant="default">{node.discriminatorType}</Badge>
      </DetailRow>
      <DetailRow label="Discriminator Path" mono>{node.discriminatorPath || '(root)'}</DetailRow>
      <DetailRow label="Slicing Rules">
        <Badge variant={node.slicingRules === 'closed' ? 'required' : 'default'}>
          {node.slicingRules}
        </Badge>
      </DetailRow>
      {node.fixedValues && Object.keys(node.fixedValues).length > 0 && (
        <DetailRow label="Fixed Values">
          <pre className={styles.jsonBlock}>{JSON.stringify(node.fixedValues, null, 2)}</pre>
        </DetailRow>
      )}
    </>
  );
}

function ExtensionDetails({ node }: { node: ExtensionTreeNode }) {
  return (
    <>
      <DetailRow label="Extension URL" mono>{node.extensionUrl}</DetailRow>
      <DetailRow label="Extension Kind">
        <Badge variant="default">{node.extensionKind}</Badge>
      </DetailRow>
      <CardinalityRow min={node.min} max={node.max} />
      <MustSupportRow value={node.mustSupport} />
      {node.valueType && <DetailRow label="Value Type">{node.valueType}</DetailRow>}
    </>
  );
}

function ChoiceDetails({ node }: { node: ChoiceTreeNode }) {
  return (
    <>
      <DetailRow label="Base Name" mono>{node.baseName}</DetailRow>
      <CardinalityRow min={node.min} max={node.max} />
      <MustSupportRow value={node.mustSupport} />
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Variants</span>
        <div className={styles.variantList}>
          {node.variants.map((v) => (
            <div key={v.jsonKey} className={styles.variantItem}>
              <span className={styles.variantKey}>{v.jsonKey}</span>
              <span className={styles.variantType}>{v.typeCode}</span>
            </div>
          ))}
        </div>
      </div>
      {node.binding && <BindingSection binding={node.binding} />}
    </>
  );
}

function BackboneDetails({ node }: { node: BackboneTreeNode }) {
  return (
    <>
      <CardinalityRow min={node.min} max={node.max} />
      <MustSupportRow value={node.mustSupport} />
      <DetailRow label="Children">
        {node.children ? `${node.children.length} child element(s)` : 'None'}
      </DetailRow>
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function DetailRow({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={mono ? styles.detailValueMono : styles.detailValue}>{children}</span>
    </div>
  );
}

function CardinalityRow({ min, max }: { min: number; max: string }) {
  const isRequired = min >= 1;
  return (
    <DetailRow label="Cardinality">
      <Badge variant={isRequired ? 'required' : 'optional'}>{`${min}..${max}`}</Badge>
    </DetailRow>
  );
}

function MustSupportRow({ value }: { value: boolean }) {
  if (!value) return null;
  return (
    <DetailRow label="Must Support">
      <Badge variant="mustSupport">MS</Badge>
    </DetailRow>
  );
}

function BindingSection({ binding }: { binding: { strength: string; valueSetUrl: string; valueSetName?: string } }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>Binding</span>
      <div className={styles.bindingBlock}>
        <Badge variant={`binding-${binding.strength}` as never}>{binding.strength}</Badge>
        <span className={styles.bindingUrl} title={binding.valueSetUrl}>
          {binding.valueSetName || binding.valueSetUrl}
        </span>
      </div>
    </div>
  );
}
