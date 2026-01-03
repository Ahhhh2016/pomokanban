import classcat from 'classcat';
import update from 'immutability-helper';

import { JSX, createPortal, render, unmountComponentAtNode } from 'preact/compat';
import { Dispatch, StateUpdater, useContext, useEffect, useRef, useState } from 'preact/hooks';

import { Icon } from '../components/Icon/Icon';
import { c, generateInstanceId, noop, useIMEInputProps } from '../components/helpers';
import { DndContext } from '../dnd/components/DndContext';
import { DragOverlay } from '../dnd/components/DragOverlay';
import { Droppable } from '../dnd/components/Droppable';
import { DndScope } from '../dnd/components/Scope';
import { SortPlaceholder } from '../dnd/components/SortPlaceholder';
import { Sortable } from '../dnd/components/Sortable';
import { DndManagerContext } from '../dnd/components/context';
import { useDragHandle } from '../dnd/managers/DragManager';
import { Entity } from '../dnd/types';
import { getParentBodyElement, getParentWindow } from '../dnd/util/getWindow';
import { t } from '../lang/helpers';

interface ItemProps {
  index: number;
  isStatic?: boolean;
  reason: string;
  deleteItem: () => void;
  updateItem: (value: string) => void;
}

interface InterruptReasonSettingsProps {
  items: string[];
  scrollEl: HTMLElement;
  onChange(items: string[]): void;
  portalContainer: HTMLElement;
}

function Item({ isStatic, index, reason, deleteItem, updateItem }: ItemProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const bindHandle = useDragHandle(measureRef, dragHandleRef);

  const body = (
    <div className={c('setting-controls-wrapper')}>
      <div className={c('setting-input-wrapper')}>
        <div>
          <input
            type="text"
            value={reason}
            onChange={(e) => updateItem((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div ref={measureRef} className={c('setting-item-wrapper')}>
      <div ref={elementRef} className={c('setting-item')}>
        {isStatic ? (
          body
        ) : (
          <Droppable
            elementRef={elementRef}
            measureRef={measureRef}
            id={`reason-${index}`}
            index={index}
            data={{
              type: 'reason',
              id: `reason-${index}`,
              accepts: ['reason'],
              reason
            }}
          >
            {body}
          </Droppable>
        )}
        <div className={c('setting-button-wrapper')}>
          <div className="clickable-icon" onClick={deleteItem} aria-label={t('Delete')}>
            <Icon name="lucide-trash-2" />
          </div>
          <div
            className="mobile-option-setting-drag-icon clickable-icon"
            aria-label={t('Drag to rearrange')}
            ref={bindHandle}
          >
            <Icon name="lucide-grip-horizontal" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface UseKeyModifiersParams {
  onChange(items: string[]): void;
  inputValue: string;
  items: string[];
  setItems: Dispatch<StateUpdater<string[]>>;
}

function useKeyModifiers({ onChange, inputValue, items, setItems }: UseKeyModifiersParams) {
  const updateItems = (next: string[]) => {
    onChange(next);
    setItems(next);
  };

  return {
    updateItem: (i: number) => (value: string) => {
      updateItems(
        update(items, {
          [i]: { $set: value },
        })
      );
    },
    deleteItem: (i: number) => () => {
      updateItems(
        update(items, {
          $splice: [[i, 1]],
        })
      );
    },
    newItem: () => {
      if (!inputValue) return;
      updateItems(
        update(items, {
          $push: [inputValue],
        })
      );
    },
    moveItem: (drag: Entity, drop: Entity) => {
      const dragPath = drag.getPath();
      const dropPath = drop.getPath();
      const dragIndex = dragPath[dragPath.length - 1];
      const dropIndex = dropPath[dropPath.length - 1];
      if (dragIndex === dropIndex) return;
      const clone = items.slice();
      const [removed] = clone.splice(dragIndex, 1);
      clone.splice(dropIndex, 0, removed);
      updateItems(clone);
    },
  };
}

const accepts = ['reason'];

function Overlay({ items, portalContainer }: { items: string[]; portalContainer: HTMLElement }) {
  return createPortal(
    <DragOverlay>
      {(entity, styles) => {
        const path = entity.getPath();
        const index = path[0];
        const item = items[index];

        return (
          <div className={classcat([c('drag-container'), c('tag-sort-input-wrapper')])} style={styles}>
            <Item reason={item} index={index} updateItem={noop} deleteItem={noop} isStatic={true} />
          </div>
        );
      }}
    </DragOverlay>,
    portalContainer
  );
}

function RespondToScroll({ scrollEl }: { scrollEl: HTMLElement }): JSX.Element | null {
  const dndManager = useContext(DndManagerContext);

  useEffect(() => {
    let debounce = 0;

    const onScroll = () => {
      scrollEl.win.clearTimeout(debounce);
      debounce = scrollEl.win.setTimeout(() => {
        dndManager?.hitboxEntities.forEach((entity) => {
          entity.recalcInitial();
        });
      }, 100);
    };

    scrollEl.addEventListener('scroll', onScroll, { passive: true, capture: false });

    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
    };
  }, [scrollEl, dndManager]);

  return null;
}

function InterruptReasonSettingsComponent(props: InterruptReasonSettingsProps) {
  const [items, setItems] = useState(props.items);
  const [inputValue, setInputValue] = useState('');
  const { getShouldIMEBlockAction, ...inputProps } = useIMEInputProps();
  const win = getParentWindow(props.scrollEl);

  const { updateItem, deleteItem, newItem, moveItem } = useKeyModifiers({
    onChange: props.onChange,
    inputValue,
    items,
    setItems,
  });

  return (
    <div className={c('tag-sort-input-wrapper')}>
      <div className="setting-item-info">
        <div className="setting-item-name">{t('Interrupt reasons')}</div>
        <div className="setting-item-description">
          {t('Customize the reasons shown when stopping the timer.')}
        </div>
      </div>
      <div>
        <DndContext win={win} onDrop={moveItem}>
          <RespondToScroll scrollEl={props.scrollEl} />
          <DndScope>
            <Sortable axis="vertical">
              {items.map((reason, i) => (
                <Item key={`reason-${i}`} reason={reason} index={i} updateItem={updateItem(i)} deleteItem={deleteItem(i)} />
              ))}
              <SortPlaceholder accepts={accepts} index={items.length} />
            </Sortable>
          </DndScope>
          <Overlay items={items} portalContainer={props.portalContainer} />
        </DndContext>
      </div>
      <div className={c('setting-key-input-wrapper')}>
        <input
          placeholder={t('Reason')}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (getShouldIMEBlockAction()) return;
            if (e.key === 'Enter') {
              newItem();
              setInputValue('');
              return;
            }
            if (e.key === 'Escape') {
              setInputValue('');
              (e.target as HTMLInputElement).blur();
            }
          }}
          {...inputProps}
        />
        <button
          onClick={() => {
            newItem();
            setInputValue('');
          }}
        >
          {t('Add')}
        </button>
      </div>
    </div>
  );
}

export function renderInterruptReasonSettings(
  containerEl: HTMLElement,
  scrollEl: HTMLElement,
  items: string[],
  onChange: (items: string[]) => void
) {
  render(
    <InterruptReasonSettingsComponent
      items={items}
      scrollEl={scrollEl}
      onChange={onChange}
      portalContainer={getParentBodyElement(containerEl)}
    />,
    containerEl
  );
}

export function cleanUpInterruptReasonSettings(containerEl: HTMLElement) {
  unmountComponentAtNode(containerEl);
} 