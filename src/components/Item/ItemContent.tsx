import { EditorView } from '@codemirror/view';
import { memo } from 'preact/compat';
import {
  Dispatch,
  StateUpdater,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'preact/hooks';
import { StateManager } from 'src/StateManager';
import { useNestedEntityPath } from 'src/dnd/components/Droppable';
import { Path } from 'src/dnd/types';
import { getTaskStatusDone, toggleTaskString } from 'src/parsers/helpers/inlineMetadata';

import { MarkdownEditor, allowNewLine } from '../Editor/MarkdownEditor';
import {
  MarkdownClonedPreviewRenderer,
  MarkdownRenderer,
} from '../MarkdownRenderer/MarkdownRenderer';
import { KanbanContext, SearchContext } from '../context';
import { c, useGetDateColorFn, useGetTagColorFn } from '../helpers';
import { EditState, EditingState, Item, isEditing } from '../types';
import { DateAndTime, RelativeDate } from './DateAndTime';
import { InlineMetadata } from './InlineMetadata';
import { preprocessTitle, filterTimelogFromMarkdown } from '../../parsers/helpers/hydrateBoard';
import {
  constructDatePicker,
  constructMenuDatePickerOnChange,
  constructMenuTimePickerOnChange,
  constructTimePicker,
} from './helpers';

export function useDatePickers(item: Item, explicitPath?: Path) {
  const { stateManager, boardModifiers } = useContext(KanbanContext);
  const path = explicitPath || useNestedEntityPath();

  return useMemo(() => {
    const onEditDate = (e: MouseEvent) => {
      constructDatePicker(
        e.view,
        stateManager,
        { x: e.clientX, y: e.clientY },
        constructMenuDatePickerOnChange({
          stateManager,
          boardModifiers,
          item,
          hasDate: true,
          path,
        }),
        item.data.metadata.date?.toDate()
      );
    };

    const onEditTime = (e: MouseEvent) => {
      constructTimePicker(
        e.view, // Preact uses real events, so this is safe
        stateManager,
        { x: e.clientX, y: e.clientY },
        constructMenuTimePickerOnChange({
          stateManager,
          boardModifiers,
          item,
          hasTime: true,
          path,
        }),
        item.data.metadata.time
      );
    };

    return {
      onEditDate,
      onEditTime,
    };
  }, [boardModifiers, path, item, stateManager]);
}

export interface ItemContentProps {
  item: Item;
  setEditState: Dispatch<StateUpdater<EditState>>;
  searchQuery?: string;
  showMetadata?: boolean;
  editState: EditState;
  isStatic: boolean;
}

function checkCheckbox(stateManager: StateManager, title: string, checkboxIndex: number) {
  let count = 0;

  const lines = title.split(/\n\r?/g);
  const results: string[] = [];

  lines.forEach((line) => {
    if (count > checkboxIndex) {
      results.push(line);
      return;
    }

    const match = line.match(/^(\s*>)*(\s*[-+*]\s+?\[)([^\]])(\]\s+)/);

    if (match) {
      if (count === checkboxIndex) {
        const updates = toggleTaskString(line, stateManager.file);
        if (updates) {
          results.push(updates);
        } else {
          const check = match[3] === ' ' ? getTaskStatusDone() : ' ';
          const m1 = match[1] ?? '';
          const m2 = match[2] ?? '';
          const m4 = match[4] ?? '';
          results.push(m1 + m2 + check + m4 + line.slice(match[0].length));
        }
      } else {
        results.push(line);
      }
      count++;
      return;
    }

    results.push(line);
  });

  return results.join('\n');
}

export function Tags({
  tags,
  searchQuery,
  alwaysShow,
}: {
  tags?: string[];
  searchQuery?: string;
  alwaysShow?: boolean;
}) {
  const { stateManager } = useContext(KanbanContext);
  const getTagColor = useGetTagColorFn(stateManager);
  const search = useContext(SearchContext);
  const shouldShow = stateManager.useSetting('move-tags') || alwaysShow;

  if (!tags.length || !shouldShow) return null;

  return (
    <div className={c('item-tags')}>
      {tags.map((tag, i) => {
        const tagColor = getTagColor(tag);

        return (
          <a
            href={tag}
            onClick={(e) => {
              e.preventDefault();

              const tagAction = stateManager.getSetting('tag-action');
              if (search && tagAction === 'kanban') {
                search.search(tag, true);
                return;
              }

              (stateManager.app as any).internalPlugins
                .getPluginById('global-search')
                .instance.openGlobalSearch(`tag:${tag}`);
            }}
            key={i}
            className={`tag ${c('item-tag')} ${
              searchQuery && tag.toLocaleLowerCase().contains(searchQuery) ? 'is-search-match' : ''
            }`}
            style={
              tagColor && {
                '--tag-color': tagColor.color,
                '--tag-background': tagColor.backgroundColor,
              }
            }
          >
            <span>{tag[0]}</span>
            {tag.slice(1)}
          </a>
        );
      })}
    </div>
  );
}

export const ItemContent = memo(function ItemContent({
  item,
  editState,
  setEditState,
  searchQuery,
  showMetadata = true,
  isStatic,
}: ItemContentProps) {
  const { stateManager, filePath, boardModifiers } = useContext(KanbanContext);
  const getDateColor = useGetDateColorFn(stateManager);
  const titleRef = useRef<string | null>(null);
  
  // Use useSetting to listen for changes to hide-timelog setting
  const hideTimelog = stateManager.useSetting('hide-timelog');

  const tomatoIconSrc = useMemo(() => {
     // Inline data URL to avoid filesystem path resolution issues inside Obsidian sandbox
    const b64 = 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMjRweCIgdmlld0JveD0iMCAtOTYwIDk2MCA5NjAiIHdpZHRoPSIyNHB4IiBmaWxsPSIjMWYxZjFmIj48cGF0aCBkPSJNNDgwLTY3NXEtMTgtMTMtMzguNS0xOXQtNDEuNS02cS0yNyAwLTUzIDEwLjVUMzAxLTY1OXEtMjAgMjAtMzAuNSA0NlQyNjAtNTYwcTAgMjEgNiA0MS41dDE5IDM4LjVxLTEzIDE4LTE5IDM4LjV0LTYgNDEuNXEwIDI3IDEwLjUgNTN0MzAuNSA0NnEyMCAyMCA0NiAzMC41dDUzIDEwLjVxMjEgMCA0MS41LTZ0MzguNS0xOXExOCAxMyAzOC41IDE5dDQxLjUgNnEyNyAwIDUzLTEwLjV0NDYtMzAuNXEyMC0yMCAzMC41LTQ2dDEwLjUtNTNxMC0yMS02LTQxLjVUNjc1LTQ4MHExMy0xOCAxOS0zOC41dDYtNDEuNXEwLTI3LTEwLjUtNTNUNjU5LTY1OXEtMjAtMjAtNDYtMzAuNVQ1NjAtNzAwcS0yMSAwLTQxLjUgNlQ0ODAtNjc1Wm0wIDI5Mi00NiAzMnEtOCA1LTE2LjUgOHQtMTcuNSAzcS0xMSAwLTIyLTQuNVQzNTgtMzU4cS05LTktMTMuNS0yMHQtNC41LTIycTAtOSAzLTE3LjV0OC0xNi41bDMyLTQ2LTMyLTQ2cS01LTgtOC0xNi41dC0zLTE3LjVxMC0xMSA0LjUtMjJ0MTMuNS0yMHE5LTkgMjAtMTMuNXQyMi00LjVxOSAwIDE3LjUgM3QxNi41IDhsNDYgMzIgNDYtMzJxOC01IDE2LjUtOHQxNy41LTNxMTEgMCAyMiA0LjV0MjAgMTMuNXE5IDkgMTMuNSAyMHQ0LjUgMjJxMCA5LTMgMTcuNXQtOCAxNi41bC0zMiA0NiAzMiA0NnE1IDggOCAxNi41dDMgMTcuNXEwIDExLTQuNSAyMlQ2MDItMzU4cS05IDktMjAgMTMuNXQtMjIgNC41cS05IDAtMTcuNS0zdC0xNi41LThsLTQ2LTMyWm0wLTQ3cTIxIDAgMzUuNS0xNC41VDUzMC00ODBxMC0yMS0xNC41LTM1LjVUNDgwLTUzMHEtMjEgMC0zNS41IDE0LjVUNDMwLTQ4MHEwIDIxIDE0LjUgMzUuNVQ0ODAtNDMwWm0wIDM1MHEtODMgMC0xNTYtMzEuNVQxOTctMTk3cS01NC01NC04NS41LTEyN1Q4MC00ODBxMC04MyAzMS41LTE1NlQxOTctNzYzcTU0LTU0IDEyNy04NS41VDQ4MC04ODBxODMgMCAxNTYgMzEuNVQ3NjMtNzYzcTU0IDU0IDg1LjUgMTI3VDg4MC00ODBxMCA4My0zMS41IDE1NlQ3NjMtMTk3cS01NCA1NC0xMjcgODUuNVQ0ODAtODBabTAtODBxMTM0IDAgMjI3LTkzdDkzLTIyN3EwLTEzNC05My0yMjd0LTIyNy05M3EtMTM0IDAtMjI3IDkzdC05MyAyMjdxMCAxMzQgOTMgMjI3dDIyNyA5M1ptMC0zMjBaIi8+PC9zdmc+%'
    const clean = b64.replace(/\s+/g, '').replace(/%+$/, '');
    return `data:image/svg+xml;base64,${clean}`;
  }, []);

  useEffect(() => {
    if (editState === EditingState.complete) {
      if (titleRef.current !== null) {
        // When timelog is hidden during editing, the editor value has timelog lines filtered out.
        // Merge back existing timelog lines on save so they are preserved in markdown.
        let contentToSave = titleRef.current;
        if (hideTimelog) {
          const existingLogs: string[] = item?.data?.metadata?.timelogs || [];
          if (existingLogs.length > 0) {
            const base = contentToSave.trimEnd();
            // Avoid duplicating if, for any reason, the edited content already contains the same lines
            const toAppend = existingLogs.filter((ln) => {
              const normalized = ln.trim();
              return normalized && !base.includes(normalized);
            });
            contentToSave = toAppend.length > 0 ? `${base}\n${toAppend.join('\n')}` : base;
          }
        }
        boardModifiers.updateItem(path, stateManager.updateItemContent(item, contentToSave));
      }
      titleRef.current = null;
    } else if (editState === EditingState.cancel) {
      titleRef.current = null;
    }
  }, [editState, stateManager, item]);

  const path = useNestedEntityPath();
  const { onEditDate, onEditTime } = useDatePickers(item);
  const onEnter = useCallback(
    (_cm: EditorView, mod: boolean, shift: boolean) => {
      if (!allowNewLine(stateManager, mod, shift)) {
        setEditState(EditingState.complete);
        return true;
      }
    },
    [stateManager]
  );

  const onWrapperClick = useCallback(
    (e: MouseEvent) => {
      if (e.targetNode.instanceOf(HTMLElement)) {
        if (e.targetNode.hasClass(c('item-metadata-date'))) {
          onEditDate(e);
        } else if (e.targetNode.hasClass(c('item-metadata-time'))) {
          onEditTime(e);
        }
      }
    },
    [onEditDate, onEditTime]
  );

  const onSubmit = useCallback(() => setEditState(EditingState.complete), []);

  const onEscape = useCallback(() => {
    setEditState(EditingState.cancel);
    return true;
  }, [item]);

  const onCheckboxContainerClick = useCallback(
    (e: PointerEvent) => {
      const target = e.target as HTMLElement;

      if (target.hasClass('task-list-item-checkbox')) {
        if (target.dataset.src) {
          return;
        }

        const checkboxIndex = parseInt(target.dataset.checkboxIndex, 10);
        const checked = checkCheckbox(stateManager, item.data.titleRaw, checkboxIndex);
        const updated = stateManager.updateItemContent(item, checked);

        boardModifiers.updateItem(path, updated);
      }
    },
    [path, boardModifiers, stateManager, item]
  );

  if (!isStatic && isEditing(editState)) {
    // Filter timelog and due markers from markdown content when hide-timelog is enabled
    const filteredValue = filterTimelogFromMarkdown(stateManager, item.data.titleRaw);
    
    return (
      <div className={c('item-input-wrapper')}>
        <MarkdownEditor
          editState={editState}
          className={c('item-input')}
          onEnter={onEnter}
          onEscape={onEscape}
          onSubmit={onSubmit}
          value={filteredValue}
          onChange={(update) => {
            if (update.docChanged) {
              titleRef.current = update.state.doc.toString().trim();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div onClick={onWrapperClick} className={c('item-title')}>
      {isStatic ? (
        <MarkdownClonedPreviewRenderer
          entityId={item.id}
          className={c('item-markdown')}
          markdownString={item.data.title}
          searchQuery={searchQuery}
          onPointerUp={onCheckboxContainerClick}
        />
      ) : (
        <MarkdownRenderer
          entityId={item.id}
          className={c('item-markdown')}
          markdownString={item.data.title}
          searchQuery={searchQuery}
          onPointerUp={onCheckboxContainerClick}
        />
      )}
      {showMetadata && (
        <div className={c('item-metadata')}>
          <RelativeDate item={item} stateManager={stateManager} />
          <DateAndTime
            item={item}
            stateManager={stateManager}
            filePath={filePath}
            getDateColor={getDateColor}
          />
          <InlineMetadata item={item} stateManager={stateManager} />
          <Tags tags={item.data.metadata.tags} searchQuery={searchQuery} />


          {item.data.metadata.timelogs?.length > 0 && !hideTimelog && (
            <div className={c('item-timelogs')}>
              {item.data.metadata.timelogs.map((log, i) => {
                // Replace leading '++' or '🍅' with the tomato SVG icon for display
                const displayLog = log.replace(
                  /^\s*(\+\+|🍅)\s/,
                  `<img class="${c('icon')} ${c('icon-pomodoro-tomato')}" src="${tomatoIconSrc}" alt="" /> `
                );
                return (
                  <span
                    key={i}
                    className={c('item-timelog')}
                    dangerouslySetInnerHTML={{ __html: preprocessTitle(stateManager, displayLog) }}
                  />
                );
              })}
            </div>
          )}
          
        </div>
      )}
    </div>
  );
});
