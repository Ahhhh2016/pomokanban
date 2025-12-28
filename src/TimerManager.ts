import EventEmitter from 'eventemitter3';
import { Notice, Plugin, TFile, moment } from 'obsidian';
import update from 'immutability-helper';
import { StopReasonModal } from './components/StopReasonModal';
import { t } from './lang/helpers';

export type TimerMode = 'stopwatch' | 'pomodoro' | 'break';

interface TimerState {
  running: boolean;
  mode: TimerMode;
  start: number;
  elapsed: number;
  targetCardId?: string;
}

export interface FocusSession {
  cardId?: string;
  cardTitle?: string;
  mode: TimerMode;
  start: number;
  end: number;
  duration: number;
}

export class TimerManager {
  plugin: Plugin;
  emitter: EventEmitter;
  state: TimerState;
  intervalId: number;
  /** List of all focus sessions */
  logs: FocusSession[] = [];
  /** Temp variable to track current session start time */
  private currentSessionStart: number = 0;
  /** whether markdown logs have been parsed */
  private markdownParsed = false;
  /** track number of state managers parsed */
  private lastParsedSmCount = 0;

  /** Duration of a pomodoro session, in milliseconds */
  pomodoroDefault = 25 * 60 * 1000; // default 25 min, can be overridden via settings
  /** Duration of current break session (ms) */
  private breakDurationMs: number = 5 * 60 * 1000;
  /** Completed pomodoro count (for long break logic) */
  private pomodoroCount: number = 0;

  private shortBreakMs: number = 5 * 60 * 1000;
  private longBreakMs: number = 15 * 60 * 1000;
  private longBreakInterval: number = 4;
  private autoRounds: number = 0;

  /** Track the last mode used before break (pomodoro or stopwatch) */
  private lastWorkMode: TimerMode = 'pomodoro';
  /** Track the last card used before break */
  private lastWorkCardId?: string;
  /** Track current auto round count */
  private currentAutoRound: number = 0;

  /** Returns total break duration ms currently active */
  getBreakDuration() {
    return this.breakDurationMs;
  }

  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.emitter = new EventEmitter();
    this.state = {
      running: false,
      mode: 'stopwatch',
      start: 0,
      elapsed: 0,
    };

    // Apply initial durations from settings
    this.updateSettings();

    // Subscribe to board-specific duration changes
    this.subscribeBoardDurationChanges();

    // Obsidian helper that clears when plugin unloads
    this.intervalId = (plugin.registerInterval as any)(
      window.setInterval(() => this.tick(), 1000)
    );
  }

  /**
   * Play end-of-session sound if enabled in settings.
   * Uses user-provided audio file path if available, otherwise falls back to a simple beep generated via Web Audio API.
   */
  private playEndSound() {
    const globalSettings: any = (this.plugin as any).settings ?? {};

    // Prefer board-level settings (for the card's board) over global settings
    const sm = this.getStateManagerForCard(this.state.targetCardId);
    const getLocal = <T = any>(key: string): T | undefined => {
      try {
        return sm?.getSetting?.(key as any) as T;
      } catch {
        return undefined;
      }
    };

    const enabledLocal = getLocal<boolean>('timer-enable-sounds');
    const enabled = (enabledLocal !== undefined ? enabledLocal : (globalSettings['timer-enable-sounds'] as boolean)) ?? false;
    if (!enabled) return;

    const volLocal = getLocal<number>('timer-sound-volume');
    const volumePercentRaw: number | undefined = typeof volLocal === 'number' ? volLocal : (globalSettings['timer-sound-volume'] as number | undefined);
    const volumePercent = typeof volumePercentRaw === 'number' ? volumePercentRaw : 100;
    const volume = Math.max(0, Math.min(1, (volumePercent || 0) / 100));

    const localPathRaw = getLocal<string>('timer-sound-file');
    const localPath = (typeof localPathRaw === 'string' ? localPathRaw : '').trim();
    const globalPath = (globalSettings['timer-sound-file'] as string | undefined)?.trim?.();
    const path: string | undefined = localPath || globalPath;

    let src: string | null = null;

    if (path) {
      try {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          src = this.plugin.app.vault.getResourcePath(file);
        }
      } catch (err) {
        console.error('Unable to resolve audio file path', err);
      }
    }

    // Fallback to built-in asset inside this vault's plugin folder
    if (!src) {
      try {
        const pluginAssetPath = `${this.plugin.app.vault.configDir}/plugins/pomodoro-kanban/assets/sound.wav`;
        const file = this.plugin.app.vault.getAbstractFileByPath(pluginAssetPath);
        if (file instanceof TFile) {
          src = this.plugin.app.vault.getResourcePath(file);
        }
      } catch (err) {
        console.error('Unable to resolve built-in sound asset', err);
      }
    }

    if (src) {
      try {
        const audio = new Audio(src);
        audio.volume = volume;
        audio.play().catch(() => {/* ignore autoplay restrictions */});
        return;
      } catch (err) {
        console.error('Failed to play custom/built-in audio', err);
      }
    }

    // Fallback: generate a short beep using Web Audio API
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 1000; // 1kHz beep
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
      oscillator.stop(ctx.currentTime + 1);
    } catch (err) {
      console.error('Failed to play fallback beep', err);
    }
  }

  /** Attach listeners to each board's settings notifier so local timer changes apply immediately */
  private subscribeBoardDurationChanges() {
    const sms: Map<any, any> = (this.plugin as any).stateManagers;
    if (!sms) return;
    
    // List of timer settings to monitor
    const timerSettings = [
      'timer-pomodoro',
      'timer-short-break', 
      'timer-long-break',
      'timer-long-break-interval',
      'timer-auto-rounds'
    ];
    
    sms.forEach((sm: any) => {
      if (!sm?.settingsNotifiers) return;
      
      const listener = () => {
        // If current timer belongs to this board, update all timer settings
        if (this.state.running && this.state.targetCardId) {
          this.applyTimerSettingsForCard(this.state.targetCardId);
        }
      };
      
      // Subscribe to all timer settings
      timerSettings.forEach(settingKey => {
        let arr = sm.settingsNotifiers.get(settingKey);
        if (!arr) {
          arr = [];
          sm.settingsNotifiers.set(settingKey, arr);
        }
        arr.push(listener);
      });
    });
  }

  /**
   * Re-read duration-related settings and update internal values.
   * Should be called whenever plugin.settings changes.
   */
  updateSettings() {
    // Expect plugin.settings to exist and follow KanbanSettings interface
    const settings: any = (this.plugin as any).settings ?? {};

    const pomodoroMin = Number(settings['timer-pomodoro']);
    if (!isNaN(pomodoroMin) && pomodoroMin > 0) {
      this.pomodoroDefault = pomodoroMin * 60 * 1000;
    } else {
      this.pomodoroDefault = 25 * 60 * 1000;
    }

    // break durations
    const shortMin = Number(settings['timer-short-break']);
    const longMin = Number(settings['timer-long-break']);
    const interval = Number(settings['timer-long-break-interval']) || 4;
    const autoRounds = Number(settings['timer-auto-rounds']) || 0;

    this.shortBreakMs = !isNaN(shortMin) && shortMin > 0 ? shortMin * 60 * 1000 : 5 * 60 * 1000;
    this.longBreakMs = !isNaN(longMin) && longMin > 0 ? longMin * 60 * 1000 : 15 * 60 * 1000;
    this.longBreakInterval = interval;
    this.autoRounds = autoRounds;
  }

  /** Get board-local timer setting for the given card, falling back to global */
  private resolveTimerSettingForCard(cardId: string | undefined, settingKey: string): number | null {
    if (!cardId) return null;
    const sms: Map<any, any> = (this.plugin as any).stateManagers;
    if (!sms) return null;
    for (const sm of sms.values()) {
      // quick check if board contains this card id
      const contains = (board: any): boolean => {
        if (!board?.children) return false;
        const stack = [...board.children];
        while (stack.length) {
          const node = stack.pop();
          if (node.id === cardId) return true;
          if (node.children?.length) stack.push(...node.children);
        }
        return false;
      };

      if (contains(sm.state)) {
        const val = sm.getSetting?.(settingKey as any);
        if (val !== undefined && val !== null) return Number(val);
      }
    }
    return null;
  }

  /** Apply board-local timer settings for the given card, falling back to global */
  private applyTimerSettingsForCard(cardId?: string) {
    if (!cardId) {
      // fallback to global settings
      this.updateSettings();
      return;
    }

    // Get local settings for this card's board
    const localPomodoro = this.resolveTimerSettingForCard(cardId, 'timer-pomodoro');
    const localShortBreak = this.resolveTimerSettingForCard(cardId, 'timer-short-break');
    const localLongBreak = this.resolveTimerSettingForCard(cardId, 'timer-long-break');
    const localLongBreakInterval = this.resolveTimerSettingForCard(cardId, 'timer-long-break-interval');
    const localAutoRounds = this.resolveTimerSettingForCard(cardId, 'timer-auto-rounds');

    // Apply local settings if available, otherwise use global settings
    if (localPomodoro && !isNaN(localPomodoro) && localPomodoro > 0) {
      this.pomodoroDefault = localPomodoro * 60 * 1000;
    } else {
      // fallback to global
      const settings: any = (this.plugin as any).settings ?? {};
      const pomodoroMin = Number(settings['timer-pomodoro']);
      this.pomodoroDefault = !isNaN(pomodoroMin) && pomodoroMin > 0 ? pomodoroMin * 60 * 1000 : 25 * 60 * 1000;
    }

    if (localShortBreak && !isNaN(localShortBreak) && localShortBreak > 0) {
      this.shortBreakMs = localShortBreak * 60 * 1000;
    } else {
      // fallback to global
      const settings: any = (this.plugin as any).settings ?? {};
      const shortMin = Number(settings['timer-short-break']);
      this.shortBreakMs = !isNaN(shortMin) && shortMin > 0 ? shortMin * 60 * 1000 : 5 * 60 * 1000;
    }

    if (localLongBreak && !isNaN(localLongBreak) && localLongBreak > 0) {
      this.longBreakMs = localLongBreak * 60 * 1000;
    } else {
      // fallback to global
      const settings: any = (this.plugin as any).settings ?? {};
      const longMin = Number(settings['timer-long-break']);
      this.longBreakMs = !isNaN(longMin) && longMin > 0 ? longMin * 60 * 1000 : 15 * 60 * 1000;
    }

    if (localLongBreakInterval && !isNaN(localLongBreakInterval) && localLongBreakInterval > 0) {
      this.longBreakInterval = localLongBreakInterval;
    } else {
      // fallback to global
      const settings: any = (this.plugin as any).settings ?? {};
      const interval = Number(settings['timer-long-break-interval']) || 4;
      this.longBreakInterval = interval;
    }

    if (localAutoRounds !== null && !isNaN(localAutoRounds) && localAutoRounds >= 0) {
      this.autoRounds = localAutoRounds;
    } else {
      // fallback to global
      const settings: any = (this.plugin as any).settings ?? {};
      const autoRounds = Number(settings['timer-auto-rounds']) || 0;
      this.autoRounds = autoRounds;
    }
  }

  private tick() {
    if (!this.state.running) return;
    // emit tick each second
    this.emitter.emit('tick');
    if (this.state.mode === 'pomodoro') {
      const spent = Date.now() - this.state.start + this.state.elapsed;
      if (spent >= this.pomodoroDefault) {
        // Auto-complete pomodoro without interruption reason panel
        this.completePomodoro();
      }
    }

    if (this.state.mode === 'break') {
      const spent = Date.now() - this.state.start + this.state.elapsed;
      if (spent >= this.breakDurationMs) {
        this.stop(false);
        new Notice(t('Break over!'));
        this.playEndSound();
        
        // Check if we should auto-start next pomodoro round
        this.checkAndStartNextRound();
      }
    }
  }

  private completePomodoro() {
    // finish current pomodoro session
    this.stop(false);
    this.playEndSound();
    this.pomodoroCount += 1;
    this.currentAutoRound += 1;

    // determine break length
    const isLong = this.pomodoroCount % this.longBreakInterval === 0;
    this.breakDurationMs = isLong ? this.longBreakMs : this.shortBreakMs;

    // start break
    this.start('break', this.state.targetCardId);
  }

  /**
   * Check if we should auto-start the next pomodoro round after break ends
   */
  private checkAndStartNextRound() {
    // Only auto-start if auto rounds is enabled and we haven't reached the limit
    if (this.autoRounds > 0 && this.currentAutoRound < this.autoRounds) {
      // Auto-start next pomodoro on the same card
      setTimeout(() => {
        this.start('pomodoro', this.lastWorkCardId);
        new Notice(`${t('Auto-starting pomodoro')} ${this.currentAutoRound + 1}/${this.autoRounds}`);
      }, 1000); // Small delay to let the break end notice show
    } else if (this.autoRounds > 0 && this.currentAutoRound >= this.autoRounds) {
      // Reset auto round counter when we've completed all rounds
      this.currentAutoRound = 0;
      new Notice(`${t('Completed automatic pomodoro rounds!').replace('!', ` ${this.autoRounds} `)}`);
    }
  }

  reset(mode: TimerMode, cardId?: string, resetAutoRound: boolean = true) {
    const wasRunning = this.state.running;
    this.state = {
      running: false,
      mode,
      start: 0,
      elapsed: 0,
      targetCardId: cardId,
    };
    
    // Reset auto round counter when manually resetting or when explicitly requested
    if (resetAutoRound) {
      this.currentAutoRound = 0;
    }
   
    this.emitter.emit('change');
  }

  private stopTimer() {
    if (!this.state.running) return;
    this.state.elapsed += Date.now() - this.state.start;
    this.state.running = false;
    this.emitter.emit('change');
  }

  private resumeTimer() {
    if (this.state.running) return;
    this.state.running = true;
    this.state.start = Date.now();
    this.emitter.emit('start');
    this.emitter.emit('change');
  }

  start(mode: TimerMode, cardId?: string) {
    // Prevent starting a timer without a target card
    if (!cardId) {
      new Notice(t('Select a card to start working'));
      return;
    }

    // Don't start if we're in the middle of stopping
    if (this.state.running) {
      return;
    }
    
    // Apply board-local timer settings if available
    this.applyTimerSettingsForCard(cardId);

    // Track the last work mode and card (for break skip functionality)
    if (mode === 'pomodoro' || mode === 'stopwatch') {
      this.lastWorkMode = mode;
      this.lastWorkCardId = cardId;
    }

    // Reset auto round counter when manually starting a new pomodoro (only if not in auto mode)
    if (mode === 'pomodoro' && this.currentAutoRound === 0 && this.autoRounds === 0) {
      this.currentAutoRound = 0; // This will be incremented in completePomodoro
    }

    this.state.mode = mode;
    this.state.targetCardId = cardId;
    this.state.running = true;
    this.state.start = Date.now();
    this.currentSessionStart = this.state.start;
    this.emitter.emit('start');
    this.emitter.emit('change');
  }

  /**
   * Skip the current break timer without logging.
   * This is specifically for break sessions to allow users to skip breaks.
   * After skipping, automatically switches back to the last work mode and card.
   */
  skipBreak() {
    if (!this.state.running || this.state.mode !== 'break') return;
    
    this.stopTimer();
    
    // Switch back to the last work mode and card
    const targetMode = this.lastWorkMode;
    const targetCardId = this.lastWorkCardId;
    
    // Don't reset auto round counter when skipping break in auto mode
    const shouldResetAutoRound = this.autoRounds === 0;
    this.reset(targetMode, targetCardId, shouldResetAutoRound);
    this.emitter.emit('change');
    new Notice(t('Break skipped'));
    
    // Check if we should auto-start next pomodoro or show completion message
    if (this.autoRounds > 0) {
      if (this.currentAutoRound < this.autoRounds) {
        // More rounds to go, auto-start next pomodoro
        setTimeout(() => {
          this.start('pomodoro', targetCardId);
          new Notice(`${t('Auto-starting pomodoro')} ${this.currentAutoRound + 1}/${this.autoRounds}`);
        }, 1000); // Small delay to let the skip notice show
      } else {
        // All rounds completed, show congratulations message
        setTimeout(() => {
          this.currentAutoRound = 0;
          new Notice(`${t('Completed automatic pomodoro rounds!').replace('!', ` ${this.autoRounds} `)}`);
        }, 1000); // Small delay to let the skip notice show
      }
    }
  }

  /**
   * Stop the current timer.
   * @param askReason When true, shows StopReasonModal to collect interruption reason. When false, directly finalizes the session.
   */
  stop(askReason: boolean = true) {
    if (!this.state.running) return;
 
    // Check if timer has been running for less than 1 minute
    const currentTime = Date.now();
    const runningDuration = currentTime - this.currentSessionStart;
    const oneMinuteInMs = 60 * 1000; // 1 minute in milliseconds
    
    // If running for less than 1 minute, stop without asking for reason and don't log
    if (runningDuration < oneMinuteInMs) {
      this.stopTimer();
      // Don't reset auto round counter for short sessions in auto mode
      const shouldResetAutoRound = this.autoRounds === 0;
      this.reset(this.state.mode, this.state.targetCardId, shouldResetAutoRound);
      this.emitter.emit('change');
      new Notice(t('Sessions shorter than 1 minute are not recorded.'));
      return;
    }
    
    // Temporarily stop the timer
    this.stopTimer();
    
    const finalizeSession = () => {
      const end = Date.now();
      const duration = end - this.currentSessionStart;
      this.logs.push({
        cardId: this.state.targetCardId,
        cardTitle: this.getCardTitle(this.state.targetCardId),
        mode: this.state.mode,
        start: this.currentSessionStart,
        end,
        duration,
      });
      this.appendSessionToMarkdown(
        this.state.targetCardId,
        this.currentSessionStart,
        end,
        duration
      );
      this.emitter.emit('log');

      // Don't reset auto round counter when finalizing sessions in auto mode
      const shouldResetAutoRound = this.autoRounds === 0;
      this.reset(this.state.mode, this.state.targetCardId, shouldResetAutoRound);
      this.emitter.emit('change');
    };

    if (!askReason) {
      // Directly finalize without modal
      finalizeSession();
      return;
    }

    // Show stop reason modal for interruptions
    const stateManager = this.getStateManagerForCard(this.state.targetCardId);
    new StopReasonModal(
      this.plugin,
      (reason: string) => {
        // User selected reason, finalize
        this.emitter.emit('stop');
        new Notice(`${t('Timer stopped:')} ${reason}`);
        finalizeSession();
      },
      () => {
        // Resume timer if modal closed without selecting a reason
        this.resumeTimer();
      },
      stateManager
    ).open();
  }

  toggle(mode: TimerMode, cardId?: string) {
    // 如果有计时器在运行
    if (this.state.running) {
      // 正在运行时，如果点击的是同一个卡片 => 停止计时
      if (!cardId || cardId === this.state.targetCardId) {
        this.stop();
        return;
      }

      // 切换到新的卡片：记录之前卡片的日志，然后继续
      const now = Date.now();
      const duration = now - this.currentSessionStart;
      // 记录前一段 session
      this.logs.push({
        cardId: this.state.targetCardId,
        cardTitle: this.getCardTitle(this.state.targetCardId),
        mode: this.state.mode,
        start: this.currentSessionStart,
        end: now,
        duration,
      });
      this.appendSessionToMarkdown(this.state.targetCardId, this.currentSessionStart, now, duration);
      this.emitter.emit('log');

      // 切换目标卡片并重置当前 session 起点
      this.state.targetCardId = cardId;

      // Update last work card when switching cards during work mode
      if (this.state.mode === 'pomodoro' || this.state.mode === 'stopwatch') {
        this.lastWorkCardId = cardId;
      }

      // Keep current session timing and target duration unchanged when switching cards
      // Do NOT adjust pomodoro/break durations on switch; only apply on start()
      this.currentSessionStart = now;
      this.emitter.emit('change');
      return;
    }

    // 如果没有计时器在运行，直接启动被点击的计时器
    this.start(mode, cardId);
  }

  isRunning(mode?: TimerMode, cardId?: string) {
    if (!this.state.running) return false;
    if (mode && this.state.mode !== mode) return false;
    if (cardId && this.state.targetCardId !== cardId) return false;
    return this.state.running;
  }

  getElapsed() {
    if (!this.state.running) return this.state.elapsed;
    return Date.now() - this.state.start + this.state.elapsed;
  }

  /** Returns remaining ms for pomodoro or break; 0 for stopwatch */
  getRemaining() {
    if (this.state.mode === 'pomodoro') {
      const remaining = this.pomodoroDefault - this.getElapsed();
      return remaining > 0 ? remaining : 0;
    }
    if (this.state.mode === 'break') {
      const remaining = this.breakDurationMs - this.getElapsed();
      return remaining > 0 ? remaining : 0;
    }
    return 0;
  }

  /** Returns total focused milliseconds for a given card */
  getTotalFocused(cardId?: string) {
    this.ensureMarkdownLogs();
    if (!cardId) return 0;
    return this.logs
      .filter((l) => l.cardId === cardId)
      .reduce((sum, l) => sum + l.duration, 0);
  }

  /** Force re-parse all markdown logs (useful after data changes) */
  forceReparseLogs() {
    this.markdownParsed = false;
    this.lastParsedSmCount = 0;
    this.ensureMarkdownLogs();
  }

  /** Returns focus sessions for the given date (defaults to today) */
  getLogsForDate(date: Date = new Date()) {
    this.ensureMarkdownLogs();
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    return this.logs.filter((l) => l.start >= dayStart && l.start < dayEnd);
  }

  private ensureMarkdownLogs() {
    const sms: Map<any, any> = (this.plugin as any).stateManagers;
    if (!sms) return;
    if (!this.markdownParsed || sms.size !== this.lastParsedSmCount) {
      // Clear existing logs before re-parsing to prevent duplicates
      this.logs = [];
      this.parseLogsFromMarkdown();
      this.markdownParsed = true;
      this.lastParsedSmCount = sms.size;
    }
  }

  private parseLogsFromMarkdown() {
    const sms: Map<any, any> = (this.plugin as any).stateManagers;
    if (!sms) return;
    // Match timelog lines with optional list bullet, supporting ++, 🍅, or ⏱ markers, allowing spaces around dash variants (–, —, -)
    // 支持新的纯文本格式：++ 2024-01-15 10:00 – 10:25 (25 m)
    const lineRegex = /^(?:[-*]\s+)?(?:\+\+|🍅|⏱)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*[–—-]\s*(\d{2}:\d{2})\s+\((\d+)\s+m/;

    for (const sm of sms.values()) {
      const board = sm.state;
      if (!board?.children) continue;
      for (const lane of board.children) {
        this.extractItemLogsRecursive(sm, lane.children, lineRegex);
      }
    }
  }

  private extractItemLogsRecursive(sm: any, items: any[], lineRegex: RegExp) {
    if (!items) return;
    for (const it of items) {
      const lines = (it.data?.titleRaw as string)?.split(/\n/).slice(1) ?? [];
      for (const ln of lines) {
        const m = ln.trim().match(lineRegex);
        if (m) {
          const [_, dateStr, startStr, endStr, minsStr] = m;
          const startMoment = moment(`${dateStr} ${startStr}`, 'YYYY-MM-DD HH:mm');
          const endMoment = moment(`${dateStr} ${endStr}`, 'YYYY-MM-DD HH:mm');
          
          // Validate parsed moments
          if (startMoment.isValid() && endMoment.isValid()) {
            const start = startMoment.valueOf();
            const end = endMoment.valueOf();
            const duration = parseInt(minsStr, 10) * 60000;
            
            // Additional validation: ensure duration makes sense
            if (duration > 0 && end > start) {
              // prevent duplicates
              if (!this.logs.find((l) => l.start === start && l.cardId === it.id)) {
                this.logs.push({
                  cardId: it.id,
                  cardTitle: it.data?.title,
                  mode: ln.includes('🍅') ? 'pomodoro' : 'stopwatch',
                  start,
                  end,
                  duration,
                });
              }
            }
          }
        }
      }
      if (it.children?.length) this.extractItemLogsRecursive(sm, it.children, lineRegex);
    }
  }

  private findItemInLane(lane: any, cardId: string): any {
    if (!lane?.children) return null;
    for (const child of lane.children) {
      if (child?.data?.title && child.id === cardId) return child;
      const found = this.findItemInLane(child, cardId);
      if (found) return found;
    }
    return null;
  }

  private getCardTitle(cardId?: string): string | undefined {
    if (!cardId) return undefined;
    if (!(this.plugin as any).stateManagers) return undefined;
    const sms: Map<any, any> = (this.plugin as any).stateManagers;
    for (const sm of sms.values()) {
      const board = sm.state;
      if (!board?.children) continue;
      for (const lane of board.children) {
        const item = this.findItemInLane(lane, cardId);
        if (item) return item.data?.title;
      }
    }
    return undefined;
  }

  /** Get the stateManager for a given card */
  private getStateManagerForCard(cardId?: string): any | undefined {
    if (!cardId) return undefined;
    if (!(this.plugin as any).stateManagers) return undefined;
    const sms: Map<any, any> = (this.plugin as any).stateManagers;
    for (const sm of sms.values()) {
      const board = sm.state;
      if (!board?.children) continue;
      for (const lane of board.children) {
        const item = this.findItemInLane(lane, cardId);
        if (item) return sm;
      }
    }
    return undefined;
  }

  /** Append session bullet under the corresponding card in markdown and update board */
  private appendSessionToMarkdown(cardId: string | undefined, start: number, end: number, duration: number) {
    if (!cardId) return;
    // 使用纯文本格式，不使用时间选择器格式
    const line = `++ ${moment(start).format('YYYY-MM-DD')} ${moment(start).format('HH:mm')} – ${moment(end).format('HH:mm')} (${Math.round(duration / 60000)} m)`;
    for (const sm of (this.plugin as any).stateManagers?.values?.() ?? []) {
      const board = sm.state;
      const updated = this.appendToBoard(sm, board, cardId, line);
      if (updated) {
        sm.setState(updated);
        break; // card ids are unique across boards
      }
    }
  }

  private appendToBoard(sm: any, board: any, cardId: string, line: string): any | null {
    const updateItems = (items: any[]): any[] => {
      return items.map((it) => {
        if (it.id === cardId) {
          const newContent = it.data.titleRaw + `\n${line}`;
          const newItem = sm.updateItemContent(it, newContent);
          return newItem;
        }
        if (it.children?.length) {
          const newChildren = updateItems(it.children);
          if (newChildren !== it.children) {
            return update(it, { children: { $set: newChildren } });
          }
        }
        return it;
      });
    };

    const traverseLanes = (lanes: any[]): any[] => {
      return lanes.map((lane) => {
        const newChildren = updateItems(lane.children);
        if (newChildren !== lane.children) {
          return update(lane, { children: { $set: newChildren } });
        }
        return lane;
      });
    };

    const newLanes = traverseLanes(board.children);
    if (newLanes === board.children) return null;
    return update(board, { children: { $set: newLanes } });
  }
} 