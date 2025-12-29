import classcat from 'classcat';
import { useContext, useEffect, useState } from 'preact/hooks';
import { KanbanContext } from '../context';
import { Item } from '../types';
import { c } from '../helpers';
import { TimerManager } from '../../TimerManager';
import { Icon } from '../Icon/Icon';

interface TimerButtonProps {
  item: Item;
}

export function TimerButton({ item }: TimerButtonProps) {
  const { timerManager } = useContext(KanbanContext);
  const [isRunning, setIsRunning] = useState<boolean>(timerManager?.isRunning(undefined, item.id));

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

  if (!timerManager) return null;

  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    timerManager.toggle('stopwatch', item.id);
  };

  return (
    <a
      onClick={onClick}
      className={classcat([
        c('item-prefix-button'),
        'clickable-icon',
        { 'is-enabled': isRunning },
      ])}
      aria-label="Start timer"
    >
      <Icon name="lucide-clock" />
    </a>
  );
} 