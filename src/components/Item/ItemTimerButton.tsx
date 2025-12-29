import Preact from 'preact/compat';
import { useContext, useEffect, useState, Dispatch, StateUpdater } from 'preact/hooks';
import { KanbanContext } from '../context';
import { useNestedEntityPath } from '../../dnd/components/Droppable';

import { useTimerMenu } from './TimerMenu';
import { Icon } from '../Icon/Icon';
import { c } from '../helpers';
import { EditState, Item } from '../types';
import { TimerManager } from '../../TimerManager';
import { t } from 'src/lang/helpers';

interface ItemTimerButtonProps {
  item: Item;
  editState: EditState;
  setEditState: Dispatch<StateUpdater<EditState>>;
}

export const ItemTimerButton = Preact.memo(function ItemTimerButton({
  item,
  editState,
  setEditState,
}: ItemTimerButtonProps) {
  const { timerManager, stateManager, boardModifiers } = useContext(KanbanContext);
  const path = useNestedEntityPath();
  const [isRunning, setIsRunning] = useState<boolean>(
    timerManager?.isRunning(undefined, item.id)
  );

  useEffect(() => {
    if (!timerManager) return;
    const update = () => setIsRunning(timerManager.isRunning(undefined, item.id));
    timerManager.emitter.on('start', update);
    timerManager.emitter.on('stop', update);
    timerManager.emitter.on('tick', update);
    return () => {
      timerManager.emitter.off('start', update);
      timerManager.emitter.off('stop', update);
      timerManager.emitter.off('tick', update);
    };
  }, [timerManager, item.id]);

  const ignoreAttr = Preact.useMemo(() => {
    if (editState) {
      return {
        'data-ignore-drag': true,
      } as const;
    }
    return {} as const;
  }, [editState]);

  if (!timerManager || !stateManager || !boardModifiers) return null;

  const showTimerMenu = useTimerMenu(item, timerManager, stateManager, boardModifiers, path);

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    showTimerMenu(e);
  };

  return (
    <div {...ignoreAttr} className={c('item-prefix-button-wrapper')}>
      <a
        data-ignore-drag={true}
        onPointerDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={
          `${c('item-prefix-button')} clickable-icon` + (isRunning ? ' is-enabled' : '')
        }
        aria-label={isRunning ? 'Stop timer' : 'Start timer'}
      >
        <Icon name="lucide-clock" />
      </a>
    </div>
  );
}); 