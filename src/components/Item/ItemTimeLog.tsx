import { moment } from 'obsidian';
import { memo, useContext, useEffect, useState } from 'preact/compat';
import { KanbanContext } from '../context';
import { c } from '../helpers';

/**
 * Display individual focus time logs for a card. These are parsed from the
 * markdown bullets that TimerManager appends (e.g. "++ 2025-07-10 10:00 – 10:25 (25 m)").
 *
 * The component listens to the TimerManager `log` event so it refreshes when a
 * new session is recorded.
 */
export const ItemTimeLog = memo(function ItemTimeLog({ item }: { item: { id: string } }) {
  const { timerManager } = useContext(KanbanContext);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (!timerManager) return;
    const refresh = () => forceUpdate({});
    timerManager.emitter.on('log', refresh);
    return () => timerManager.emitter.off('log', refresh);
  }, [timerManager]);

  if (!timerManager) return null;

  const logs = timerManager.logs.filter((l) => l.cardId === item.id);

  if (!logs.length) return null;

  return (
    <div className={c('item-timelogs')}>
      {logs.map((log, idx) => {
        const start = moment(log.start);
        const end = moment(log.end);
        const durationMin = Math.round(log.duration / 60000);
        return (
          <div key={idx} className={c('item-timelog')}>
            {start.format('YYYY-MM-DD')} {start.format('HH:mm')}–{end.format('HH:mm')} ({
              durationMin
            }{' '}
            m)
          </div>
        );
      })}
    </div>
  );
}); 