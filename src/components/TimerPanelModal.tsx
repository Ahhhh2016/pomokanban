import { App, Modal } from 'obsidian';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { TimerManager } from '../TimerManager';
import { moment } from 'obsidian';
import { t } from '../lang/helpers';

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

interface Props {
  timer: TimerManager;
  boardStateManager: any; // current board's state manager (for filtering card ids)
}

interface SessionBlockProps {
  session: import('../TimerManager').FocusSession;
}

function SessionBlock({ session }: SessionBlockProps) {
  const startStr = moment(session.start).format('HH:mm');
  const endStr = moment(session.end).format('HH:mm');
  const rawTitle = session.cardTitle ?? session.cardId ?? 'Untitled';
  const firstLine = rawTitle.split('\n')[0];
  const displayTitle = firstLine.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

  return (
    <div className="kanban-timer-session-block">
      {/* 第一行：标题 */}
      <div className="kanban-timer-session-block__title">{displayTitle}</div>
      {/* 第二行：日期 + 时间范围 */}
      <em className="kanban-timer-session-block__range">
        {startStr} – {endStr}
      </em>
    </div>
  );
}

function TimerPanel({ timer, boardStateManager }: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const update = () => setTick((v) => v + 1);
    timer.emitter.on('tick', update);
    timer.emitter.on('start', update);
    timer.emitter.on('stop', update);
    timer.emitter.on('log', update);
    return () => {
      timer.emitter.off('tick', update);
      timer.emitter.off('start', update);
      timer.emitter.off('stop', update);
      timer.emitter.off('log', update);
    };
  }, [timer]);

  const isPomodoro = timer.state.mode === 'pomodoro';
  const isBreak = timer.state.mode === 'break';
  const isRunning = timer.state.running;
  const timeStr = (isPomodoro || isBreak)
    ? formatTime(timer.getRemaining())
    : formatTime(timer.getElapsed());

  // Collect all card IDs belonging to this board so we can filter logs
  const collectIds = (items: any[]): string[] => {
    if (!items) return [];
    const ids: string[] = [];
    for (const it of items) {
      if (it.id) ids.push(it.id);
      if (it.children?.length) ids.push(...collectIds(it.children));
    }
    return ids;
  };

  // Find title by card id within this board's state
  const findTitleById = (items: any[], cardId?: string): string | undefined => {
    if (!cardId || !items) return undefined;
    for (const it of items) {
      if (it?.id === cardId) return it?.data?.title;
      if (it?.children?.length) {
        const sub = findTitleById(it.children, cardId);
        if (sub) return sub;
      }
    }
    return undefined;
  };

  const boardTree = boardStateManager?.state?.children ?? [];
  const boardCardIds: Set<string> = new Set(collectIds(boardTree));

  // Ensure markdown logs are loaded and get today's logs, then filter by board
  const todayLogs = timer
    .getLogsForDate()
    .filter((s) => s.cardId && boardCardIds.has(s.cardId));
  // Exclude breaks from today's focused total
  const totalMs = todayLogs.filter((s) => s.mode !== 'break').reduce((sum, s) => sum + s.duration, 0);
  const totalMin = Math.floor(totalMs / 60000);
  const pomodoroCount = todayLogs.filter((s) => s.mode === 'pomodoro').length;
  const totalStr = totalMin >= 60 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : `${totalMin}m`;

  const toggle = () => {
    if (isBreak && isRunning) {
      // For break mode, use skipBreak instead of regular stop
      timer.skipBreak();
    } else {
      timer.toggle(timer.state.mode === 'break' ? 'stopwatch' : timer.state.mode, timer.state.targetCardId);
    }
  };

  // removed unused switchMode

  const targetCardId = timer.state.targetCardId;
  const rawTargetTitle = findTitleById(boardTree, targetCardId) ?? targetCardId ?? '';
  const targetTitle = rawTargetTitle
    ? rawTargetTitle.split('\n')[0].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim()
    : '';

  return (
    <div className="kanban-timer-panel">
      <h2 className="kanban-timer-panel__title">{isPomodoro ? t('Pomodoro') : isBreak ? t('Break') : t('Stopwatch')}</h2>

      <div className="kanban-timer-panel__time-row">
        <div className="kanban-timer-panel__time-digits">{timeStr}</div>
        <button className={`kanban-btn kanban-btn--primary`} onClick={toggle}>
          {isRunning ? (isBreak ? t('Skip') : t('Stop')) : t('Start')}
        </button>
      </div>

      {targetTitle && (
        <div className="kanban-timer-panel__current" title={targetTitle}>
          <span className="kanban-timer-panel__current-label">{t('Current card')}</span>
          <span className="kanban-timer-panel__current-pill">{targetTitle}</span>
        </div>
      )}

      {/* Logs header */}
      <div className="kanban-timer-panel__summary">
        <span>{t('TODAY')}</span>
        <span className="kanban-timer-panel__pill">{totalStr}</span>
        <span className="kanban-timer-panel__pill">{pomodoroCount} {pomodoroCount !== 1 ? t('Pomodoros') : t('Pomodoro')}</span>
      </div>

      {/* Session blocks */}
      <div className="kanban-timer-panel__sessions">
        {todayLogs.map((s) => (
          <SessionBlock key={s.start} session={s} />
        ))}
      </div>

      {/* removed target info at bottom; moved above */}

      {/* removed bottom action buttons as requested */}
    </div>
  );
}

export class TimerPanelModal extends Modal {
  timer: TimerManager;
  boardStateManager: any;
  constructor(app: App, timer: TimerManager, boardStateManager: any) {
    super(app);
    this.timer = timer;
    this.boardStateManager = boardStateManager;
  }

  onOpen() {
    render(
      <TimerPanel
        timer={this.timer}
        boardStateManager={this.boardStateManager}
      />,
      this.contentEl
    );
  }

  onClose() {
    render(null, this.contentEl);
  }
} 