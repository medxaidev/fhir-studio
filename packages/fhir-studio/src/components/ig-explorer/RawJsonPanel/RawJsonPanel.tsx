/**
 * RawJsonPanel — Right-side panel showing raw JSON of selected resource.
 */

import { useState, useEffect, useMemo } from 'react';
import { igStore } from '../../../stores/ig-store';
import { serverStore } from '../../../stores/server-store';
import { Spinner } from '../../ui';
import styles from './RawJsonPanel.module.css';

interface RawJsonPanelProps {
  resourceId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

/** Simple JSON syntax highlighting via regex */
function highlightJson(json: string): React.ReactNode[] {
  const lines = json.split('\n');
  return lines.map((line, i) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    // Match keys, strings, numbers, booleans, null
    const regex = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(\btrue\b|\bfalse\b)|(\bnull\b)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      // Text before match
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      if (match[1]) {
        // Key
        parts.push(
          <span key={`${i}-${match.index}`} className={styles.jsonKey}>{match[1]}</span>,
        );
        parts.push(':');
        lastIndex = match.index + match[0].length;
      } else if (match[2]) {
        // String value
        parts.push(
          <span key={`${i}-${match.index}`} className={styles.jsonString}>{match[2]}</span>,
        );
        lastIndex = match.index + match[0].length;
      } else if (match[3]) {
        // Number
        parts.push(
          <span key={`${i}-${match.index}`} className={styles.jsonNumber}>{match[3]}</span>,
        );
        lastIndex = match.index + match[0].length;
      } else if (match[4]) {
        // Boolean
        parts.push(
          <span key={`${i}-${match.index}`} className={styles.jsonBool}>{match[4]}</span>,
        );
        lastIndex = match.index + match[0].length;
      } else if (match[5]) {
        // Null
        parts.push(
          <span key={`${i}-${match.index}`} className={styles.jsonNull}>{match[5]}</span>,
        );
        lastIndex = match.index + match[0].length;
      }
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }
    return (
      <span key={i}>
        {parts.length > 0 ? parts : line}
        {'\n'}
      </span>
    );
  });
}

export function RawJsonPanel({
  resourceId,
  collapsed,
  onToggleCollapse,
}: RawJsonPanelProps) {
  const [json, setJson] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!resourceId) {
      setJson(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const state = igStore.getState();
    const igId = state.selectedIgId;
    if (!igId) {
      setLoading(false);
      return;
    }

    const client = serverStore.getClient();
    if (!client) {
      setLoading(false);
      return;
    }

    client.loadIGStructure(igId, resourceId).then((result) => {
      if (!cancelled && result?.sd) {
        setJson(JSON.stringify(result.sd, null, 2));
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setJson(null);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [resourceId]);

  const highlighted = useMemo(() => {
    if (!json) return null;
    return highlightJson(json);
  }, [json]);

  if (collapsed) {
    return null;
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>JSON</span>
        <button className={styles.collapseBtn} onClick={onToggleCollapse} title="Collapse panel">
          ▶
        </button>
      </div>

      <div className={styles.body}>
        {!resourceId && (
          <div className={styles.empty}>Select a profile to view JSON</div>
        )}

        {resourceId && loading && (
          <div className={styles.loading}>
            <Spinner size="sm" />
          </div>
        )}

        {resourceId && !loading && json && (
          <pre className={styles.jsonPre}>{highlighted}</pre>
        )}

        {resourceId && !loading && !json && (
          <div className={styles.empty}>Failed to load JSON</div>
        )}
      </div>
    </div>
  );
}
