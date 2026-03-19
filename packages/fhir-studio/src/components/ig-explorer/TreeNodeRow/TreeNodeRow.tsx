import { igStore } from '../../../stores/ig-store';
import type { TreeNode } from '../../../lib/ig-tree-types';
import { Badge } from '../../ui';
import {
  ElementIcon,
  SliceIcon,
  ExtensionIcon,
  ChoiceIcon,
  FolderIcon,
  BindingIcon,
  ChevronIcon,
} from '../../icons';
import styles from './TreeNodeRow.module.css';

export interface TreeNodeRowProps {
  node: TreeNode;
  selectedNodeId: string | null;
}

const KIND_ICON: Record<TreeNode['kind'], React.FC<React.SVGProps<SVGSVGElement>>> = {
  element: ElementIcon,
  slice: SliceIcon,
  extension: ExtensionIcon,
  choice: ChoiceIcon,
  backbone: FolderIcon,
};

const KIND_CLASS: Record<TreeNode['kind'], string> = {
  element: styles.kindElement,
  slice: styles.kindSlice,
  extension: styles.kindExtension,
  choice: styles.kindChoice,
  backbone: styles.kindBackbone,
};

export function TreeNodeRow({ node, selectedNodeId }: TreeNodeRowProps) {
  const Icon = KIND_ICON[node.kind];
  const kindClass = KIND_CLASS[node.kind];
  const isSelected = node.id === selectedNodeId;
  const indent = node.depth * 16;

  const handleClick = () => {
    igStore.selectNode(node.id);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    igStore.toggleNodeExpansion(node.id);
  };

  // Extract cardinality from node (all kinds have min/max)
  const min = 'min' in node ? (node as { min: number }).min : 0;
  const max = 'max' in node ? (node as { max: string }).max : '*';
  const cardStr = `${min}..${max}`;
  const isRequired = min >= 1;

  // mustSupport
  const mustSupport = 'mustSupport' in node ? (node as { mustSupport: boolean }).mustSupport : false;

  // binding
  const binding = 'binding' in node ? (node as { binding?: { strength: string } }).binding : undefined;

  // typeCode
  const typeCode = 'typeCode' in node ? (node as { typeCode: string }).typeCode : '';

  return (
    <div className={styles.wrapper}>
      <div
        className={[styles.row, isSelected ? styles.rowSelected : ''].filter(Boolean).join(' ')}
        style={{ paddingLeft: `${indent + 4}px` }}
        onClick={handleClick}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={node.hasChildren ? (node.isExpanded ?? false) : undefined}
      >
        {/* Expand/collapse toggle */}
        <span className={styles.toggle} onClick={node.hasChildren ? handleToggle : undefined}>
          {node.hasChildren ? (
            <ChevronIcon
              className={[styles.chevron, node.isExpanded ? styles.chevronOpen : '']
                .filter(Boolean)
                .join(' ')}
              width={14}
              height={14}
            />
          ) : (
            <span className={styles.chevronSpacer} />
          )}
        </span>

        {/* Kind icon */}
        <span className={[styles.icon, kindClass].join(' ')}>
          <Icon width={14} height={14} />
        </span>

        {/* Label */}
        <span className={styles.label} title={node.path}>
          {node.label}
        </span>

        {/* Type code */}
        {typeCode && <span className={styles.typeCode}>{typeCode}</span>}

        {/* Badges */}
        <span className={styles.badges}>
          <Badge variant={isRequired ? 'required' : 'optional'}>{cardStr}</Badge>
          {mustSupport && <Badge variant="mustSupport">MS</Badge>}
          {binding && (
            <span className={styles.bindingBadge}>
              <BindingIcon width={11} height={11} />
              <Badge variant={`binding-${binding.strength}` as never}>
                {binding.strength}
              </Badge>
            </span>
          )}
        </span>
      </div>

      {/* Children (recursive) */}
      {node.hasChildren && node.isExpanded && node.children && (
        <div className={styles.children} role="group">
          {node.children.map((child) => (
            <TreeNodeRow key={child.id} node={child} selectedNodeId={selectedNodeId} />
          ))}
        </div>
      )}
    </div>
  );
}
