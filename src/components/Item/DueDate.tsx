import { JSX } from 'preact/compat';
import { StateManager } from 'src/StateManager';
import { c } from '../helpers';
import { Item } from '../types';

interface DueDateProps {
  item: Item;
  stateManager: StateManager;
  onEditDueDate?: JSX.MouseEventHandler<HTMLSpanElement>;
}

export function DueDate({ item, stateManager, onEditDueDate }: DueDateProps) {
  const dateDisplayFormat = stateManager.useSetting('date-display-format');
  const timeFormat = stateManager.useSetting('time-format');

  if (!item.data.metadata.duedate) return null;

  const duedate = item.data.metadata.duedate;
  const duetime = item.data.metadata.duetime;
  const dateDisplayStr = duedate.format(dateDisplayFormat);
  const timeDisplayStr = duetime ? duetime.format(timeFormat) : null;

  return (
    <span
      onClick={onEditDueDate}
      className={`${c('item-metadata-duedate')} is-button`}
      aria-label="Change due date"
      style={{ 
        color: 'red', 
        fontWeight: 'bold',
        paddingRight: '8px'
      }}
    >
      ! Due: {dateDisplayStr}{timeDisplayStr ? ` ${timeDisplayStr}` : ''}
    </span>
  );
}
