import classcat from 'classcat';
import { isPlainObject } from 'is-plain-object';
import { TFile, moment } from 'obsidian';
import { getAPI } from 'obsidian-dataview';
import { ComponentChild } from 'preact';
import { memo, useContext, useMemo } from 'preact/compat';
import { KanbanView } from 'src/KanbanView';
import { StateManager } from 'src/StateManager';
import { InlineField, taskFields } from 'src/parsers/helpers/inlineMetadata';

import { MarkdownRenderer } from '../MarkdownRenderer/MarkdownRenderer';
import { KanbanContext } from '../context';
import { c, parseMetadataWithOptions, useGetDateColorFn } from '../helpers';
import { DataKey, FileMetadata, Item, PageData } from '../types';
import { Tags } from './ItemContent';

export interface ItemMetadataProps {
  item: Item;
  searchQuery?: string;
}

function mergeMetadata(
  fileMetadata: FileMetadata,
  inlineMetadata: InlineField[] = [],
  metadataKeys: DataKey[]
) {
  return inlineMetadata.reduce((acc, curr) => {
    if (taskFields.has(curr.key)) return acc;
    const data = parseMetadataWithOptions(curr, metadataKeys);

    acc[curr.key] = data;

    return acc;
  }, fileMetadata || {});
}

export function ItemMetadata({ item, searchQuery }: ItemMetadataProps) {
  const { stateManager } = useContext(KanbanContext);
  const mergeInlineMetadata =
    stateManager.useSetting('inline-metadata-position') === 'metadata-table';
  const metadataKeys = stateManager.useSetting('metadata-keys');
  const { fileMetadata, fileMetadataOrder, inlineMetadata } = item.data.metadata;

  const metadata = useMemo(() => {
    const metadata = mergeInlineMetadata
      ? mergeMetadata(fileMetadata, inlineMetadata, metadataKeys || [])
      : fileMetadata;

    if (!metadata) return null;
    if (!Object.keys(metadata).length) return null;

    return metadata;
  }, [fileMetadata, inlineMetadata, metadataKeys]);

  const order = useMemo(() => {
    const metadataOrder = new Set(fileMetadataOrder || []);
    if (mergeInlineMetadata && inlineMetadata?.length) {
      inlineMetadata.forEach((m) => {
        if (!metadataOrder.has(m.key)) metadataOrder.add(m.key);
      });
    }

    return Array.from(metadataOrder);
  }, [fileMetadataOrder, mergeInlineMetadata, inlineMetadata]);

  if (!metadata) {
    return null;
  }

  return (
    <div className={c('item-metadata-wrapper')}>
      <MetadataTable metadata={metadata} order={order} searchQuery={searchQuery} />
    </div>
  );
}

interface MetadataValueProps {
  data: PageData;
  dateLabel?: string;
  searchQuery?: string;
}

export function getDateFromObj(v: unknown, stateManager: StateManager) {
  let m: moment.Moment;

  if (typeof v === 'object' && v !== null && 'ts' in v) {
    m = moment(v.ts);
  } else if (moment.isMoment(v)) {
    m = v;
  } else if (v instanceof Date) {
    m = moment(v);
  }

  if (m) {
    const dateFormat = stateManager.getSetting(
      m.hours() === 0 ? 'date-display-format' : 'date-time-display-format'
    );

    return m.format(dateFormat);
  }

  return null;
}

export function getLinkFromObj(v: unknown, view: KanbanView) {
  if (typeof v !== 'object' || v === null || !('path' in v)) return null;
  const obj = v as { path: string; display?: string; subpath?: string; embed?: boolean };

  const file = (window as unknown as { app: { vault: { getAbstractFileByPath: (p: string) => unknown }, fileManager: { generateMarkdownLink: (file: TFile, src: string, subpath?: string, displayText?: string) => string } } }).app.vault.getAbstractFileByPath(obj.path);
  if (file && file instanceof TFile) {
    const link = (window as unknown as { app: { fileManager: { generateMarkdownLink: (file: TFile, src: string, subpath?: string, displayText?: string) => string } } }).app.fileManager.generateMarkdownLink(file, view.file.path, obj.subpath, obj.display);
    return `${obj.embed && link[0] !== '!' ? '!' : ''}${link}`;
  }

  return `${obj.embed ? '!' : ''}[[${obj.path}${obj.display ? `|${obj.display}` : ''}]]`;
}

function getDate(v: unknown) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = moment(v);
    if (d.isValid()) {
      return d;
    }
  }
  if (moment.isMoment(v)) return v;
  if (v instanceof Date) return moment(v);
  const dv = getAPI();
  if (dv?.value.isDate(v as any)) return moment((v as any).ts);
  return null;
}

export function anyToString(v: unknown, stateManager: StateManager): string {
  let val: unknown = v;
  if (isPlainObject(v) && (v as any).value) val = (v as any).value;
  const date = getDate(val);
  if (date) return getDateFromObj(date, stateManager);
  if (typeof val === 'string') return val;
  if (val instanceof TFile) return val.path;
  if (Array.isArray(val)) {
    return val.map((v2) => anyToString(v2, stateManager)).join(' ');
  }
  if (typeof val === 'object' && val !== null && 'rrule' in val && typeof (val as any).toText === 'function') {
    return (val as any).toText();
  }
  const dv = getAPI();
  if (dv) return dv.value.toString(val);
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return Object.prototype.toString.call(val as object);
    }
  }
  return String(val);
}

export function pageDataToString(data: PageData, stateManager: StateManager): string {
  return anyToString(data.value, stateManager);
}

export function MetadataValue({ data, dateLabel, searchQuery }: MetadataValueProps) {
  const { view, stateManager } = useContext(KanbanContext);
  const getDateColor = useGetDateColorFn(stateManager);

  const renderChild = (v: unknown, sep?: string) => {
    const link = getLinkFromObj(v, view);
    const date = getDate(v);
    const str = anyToString(v, stateManager);
    const isMatch = searchQuery && str.toLocaleLowerCase().contains(searchQuery);

    let content: ComponentChild;
    if (link || data.containsMarkdown) {
      content = (
        <MarkdownRenderer
          className="inline"
          markdownString={link ? link : str}
          searchQuery={searchQuery}
        />
      );
    } else if (date) {
      const dateColor = getDateColor(date);
      content = (
        <span
          className={classcat({
            [c('date')]: true,
            'is-search-match': isMatch,
            'has-background': dateColor?.backgroundColor,
          })}
          style={
            dateColor && {
              '--date-color': dateColor.color,
              '--date-background-color': dateColor.backgroundColor,
            }
          }
        >
          {!!dateLabel && <span className={c('item-metadata-date-label')}>{dateLabel}</span>}
          <span className={c('item-metadata-date')}>{str}</span>
        </span>
      );
    } else if (isMatch) {
      content = <span className="is-search-match">{str}</span>;
    } else {
      content = str;
    }

    return (
      <>
        {content}
        {sep ? <span>{sep}</span> : null}
      </>
    );
  };

  if (Array.isArray(data.value)) {
    return (
      <span className={classcat([c('meta-value'), 'mod-array'])}>
        {data.value.map((v, i, arr) => {
          return renderChild(v, i < arr.length - 1 ? ', ' : undefined);
        })}
      </span>
    );
  }

  return <span className={classcat([c('meta-value')])}>{renderChild(data.value)}</span>;
}

export interface MetadataTableProps {
  metadata: { [k: string]: PageData } | null;
  order?: string[];
  searchQuery?: string;
}

export const MetadataTable = memo(function MetadataTable({
  metadata,
  order,
  searchQuery,
}: MetadataTableProps) {
  const { stateManager } = useContext(KanbanContext);

  if (!metadata) return null;
  if (!order?.length) order = Object.keys(metadata);

  return (
    <table className={c('meta-table')}>
      <tbody>
        {order.map((k) => {
          const data = metadata[k];
          if (!data) return null;

          const isSearchMatch = (data.label || k).toLocaleLowerCase().contains(searchQuery);
          return (
            <tr key={k} className={c('meta-row')}>
              {!data.shouldHideLabel && (
                <td
                  className={classcat([
                    c('meta-key'),
                    {
                      'is-search-match': isSearchMatch,
                    },
                  ])}
                  data-key={k}
                >
                  <span>{data.label || k}</span>
                </td>
              )}
              <td
                colSpan={data.shouldHideLabel ? 2 : 1}
                className={c('meta-value-wrapper')}
                data-value={pageDataToString(data, stateManager)}
              >
                {k === 'tags' ? (
                  <Tags searchQuery={searchQuery} tags={data.value as string[]} alwaysShow />
                ) : (
                  <MetadataValue data={data} searchQuery={searchQuery} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
});
