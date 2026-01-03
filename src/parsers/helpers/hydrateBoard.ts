import { moment } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { c, escapeRegExpStr, getDateColorFn } from 'src/components/helpers';
import { Board, DataTypes, DateColor, Item, Lane } from 'src/components/types';
import { Path } from 'src/dnd/types';
import { getEntityFromPath } from 'src/dnd/util/data';
import { Op } from 'src/helpers/patch';

import { getSearchValue } from '../common';

export function hydrateLane(stateManager: StateManager, lane: Lane) {
  return lane;
}

export function preprocessTitle(stateManager: StateManager, title: string) {
  const getDateColor = getDateColorFn(stateManager.getSetting('date-colors'));
  const dateTrigger = stateManager.getSetting('date-trigger');
  const dateFormat = stateManager.getSetting('date-format');
  const dateDisplayFormat = stateManager.getSetting('date-display-format');
  const timeTrigger = stateManager.getSetting('time-trigger');
  const timeFormat = stateManager.getSetting('time-format');
  const hideTimelog = stateManager.getSetting('hide-timelog');

  const { app } = stateManager;

  let date: moment.Moment;
  let dateColor: DateColor;
  const getWrapperStyles = (baseClass: string) => {
    let wrapperStyle = '';
    if (dateColor) {
      if (dateColor.backgroundColor) {
        baseClass += ' has-background';
        wrapperStyle = ` style="--date-color: ${dateColor.color}; --date-background-color: ${dateColor.backgroundColor};"`;
      } else {
        wrapperStyle = ` style="--date-color: ${dateColor.color};"`;
      }
    }
    return { wrapperClass: baseClass, wrapperStyle };
  };

  title = title.replace(
    new RegExp(`(^|\\s)${escapeRegExpStr(dateTrigger)}\\[\\[([^\\]]+)\\]\\]`, 'g'),
    (_match, space, content) => {
      const parsed = moment(content, dateFormat);
      if (!parsed.isValid()) return match;
      date = parsed;
      const linkPath = app.metadataCache.getFirstLinkpathDest(content, stateManager.file.path);
      if (!dateColor) dateColor = getDateColor(parsed);
      const { wrapperClass, wrapperStyle } = getWrapperStyles(c('preview-date-wrapper'));
      return `${space}<span data-date="${date.toISOString()}" class="${wrapperClass} ${c('date')} ${c('preview-date-link')}"${wrapperStyle}><a class="${c('preview-date')} internal-link" data-href="${linkPath?.path ?? content}" href="${linkPath?.path ?? content}" target="_blank" rel="noopener">${parsed.format(dateDisplayFormat)}</a></span>`;
    }
  );
  title = title.replace(
    new RegExp(`(^|\\s)${escapeRegExpStr(dateTrigger)}\\[([^\\]]+)\\]\\([^)]+\\)`, 'g'),
    (_match, space, content) => {
      const parsed = moment(content, dateFormat);
      if (!parsed.isValid()) return match;
      date = parsed;
      const linkPath = app.metadataCache.getFirstLinkpathDest(content, stateManager.file.path);
      if (!dateColor) dateColor = getDateColor(parsed);
      const { wrapperClass, wrapperStyle } = getWrapperStyles(c('preview-date-wrapper'));
      return `${space}<span data-date="${date.toISOString()}" class="${wrapperClass} ${c('date')} ${c('preview-date-link')}"${wrapperStyle}><a class="${c('preview-date')} internal-link" data-href="${linkPath?.path ?? content}" href="${linkPath?.path ?? content}" target="_blank" rel="noopener">${parsed.format(dateDisplayFormat)}</a></span>`;
    }
  );
  title = title.replace(
    new RegExp(`(^|\\s)${escapeRegExpStr(dateTrigger)}{([^}]+)}`, 'g'),
    (_match, space, content) => {
      const parsed = moment(content, dateFormat);
      if (!parsed.isValid()) return match;
      date = parsed;
      if (!dateColor) dateColor = getDateColor(parsed);
      const { wrapperClass, wrapperStyle } = getWrapperStyles(c('preview-date-wrapper'));
      return `${space}<span data-date="${date.toISOString()}" class="${wrapperClass} ${c('date')}"${wrapperStyle}><span class="${c('preview-date')} ${c('item-metadata-date')}">${parsed.format(dateDisplayFormat)}</span></span>`;
    }
  );

  title = title.replace(
    new RegExp(`(^|\\s)${escapeRegExpStr(timeTrigger)}{([^}]+)}`, 'g'),
    (_match, space, content) => {
      const parsed = moment(content, timeFormat);
      if (!parsed.isValid()) return match;

      if (!date) {
        date = parsed;
        date.year(1970);
      } else {
        date.hour(parsed.hour());
        date.minute(parsed.minute());
        date.second(parsed.second());
      }

      const { wrapperClass, wrapperStyle } = getWrapperStyles(c('preview-time-wrapper'));
      return `${space}<span data-date="${date.toISOString()}" class="${wrapperClass} ${c('date')}"${wrapperStyle}><span class="${c('preview-time')} ${c('item-metadata-time')}">${parsed.format(timeFormat)}</span></span>`;
    }
  );

  // Handle due date and due time - hide from markdown content display when timelog is hidden
  if (hideTimelog) {
    // Hide due date from markdown content display when timelog is hidden
    title = title.replace(
      new RegExp(`(^|\\s)due:${escapeRegExpStr(dateTrigger)}{([^}]+)}`, 'g'),
      (_match, space, _content) => {
        // Hide due date from markdown content display when timelog is hidden
        return space;
      }
    );

    title = title.replace(
      new RegExp(`(^|\\s)due:${escapeRegExpStr(dateTrigger)}\\[([^\\]]+)\\]\\([^)]+\\)`, 'g'),
      (_match, space, _content) => {
        // Hide due date from markdown content display when timelog is hidden
        return space;
      }
    );

    // Hide due time from markdown content display when timelog is hidden
    title = title.replace(
      new RegExp(`(^|\\s)due:${escapeRegExpStr(timeTrigger)}{([^}]+)}`, 'g'),
      (_match, space, _content) => {
        // Hide due time from markdown content display when timelog is hidden
        return space;
      }
    );

    // Hide due time with double trigger (due:@@{time}) from markdown content display when timelog is hidden
    title = title.replace(
      new RegExp(`(^|\\s)due:${escapeRegExpStr(timeTrigger)}${escapeRegExpStr(timeTrigger)}{([^}]+)}`, 'g'),
      (_match, space, _content) => {
        // Hide due time from markdown content display when timelog is hidden
        return space;
      }
    );
  } else {
    // Original behavior when timelog is not hidden - remove from markdown content display (now only shown in focused time line)
    title = title.replace(
      new RegExp(`(^|\\s)due:${escapeRegExpStr(dateTrigger)}{([^}]+)}`, 'g'),
      (_match, space, _content) => {
        // Remove due date from markdown content display - it's now only shown in focused time line
        return space;
      }
    );

    title = title.replace(
      new RegExp(`(^|\\s)due:${escapeRegExpStr(dateTrigger)}\\[([^\\]]+)\\]\\([^)]+\\)`, 'g'),
      (_match, space, _content) => {
        // Remove due date from markdown content display - it's now only shown in focused time line
        return space;
      }
    );

    // Handle due time - remove from markdown content display (now only shown in focused time line)
    title = title.replace(
      new RegExp(`(^|\\s)due:${escapeRegExpStr(timeTrigger)}{([^}]+)}`, 'g'),
      (_match, space, _content) => {
        // Remove due time from markdown content display - it's now only shown in focused time line
        return space;
      }
    );

    // Handle due time with double trigger (due:@@{time}) - remove from markdown content display
    title = title.replace(
      new RegExp(`(^|\\s)due:${escapeRegExpStr(timeTrigger)}${escapeRegExpStr(timeTrigger)}{([^}]+)}`, 'g'),
      (_match, space, _content) => {
        // Remove due time from markdown content display - it's now only shown in focused time line
        return space;
      }
    );
  }

  // Handle estimate time - remove from markdown content display (shown separately)
  title = title.replace(
    new RegExp(`(^|\\s)estimate:@{([^}]+)}`, 'g'),
    (_match, space, _content) => {
      // Remove estimate time from markdown content display - it's shown separately
      return space;
    }
  );

  return title;
}

/**
 * Filter timelog and due markers from markdown content for editing mode
 * when hide-timelog setting is enabled
 */
export function filterTimelogFromMarkdown(stateManager: StateManager, markdown: string): string {
  const hideTimelog = stateManager.getSetting('hide-timelog');
  
  if (!hideTimelog) {
    return markdown;
  }

  const dateTrigger = stateManager.getSetting('date-trigger');
  const timeTrigger = stateManager.getSetting('time-trigger');
  
  let filteredMarkdown = markdown;

  // Remove timelog lines (those starting with "++" or "🍅")
  filteredMarkdown = filteredMarkdown.replace(/^\s*(\+\+|🍅)\s.*$/gm, '');

  // Remove due date markers
  filteredMarkdown = filteredMarkdown.replace(
    new RegExp(`(^|\\s)due:${escapeRegExpStr(dateTrigger)}([^\\s]+)`, 'gm'),
    (_match, space) => space
  );

  filteredMarkdown = filteredMarkdown.replace(
    new RegExp(`(^|\\s)due:${escapeRegExpStr(dateTrigger)}\\[([^\\]]+)\\]\\([^)]+\\)`, 'gm'),
    (_match, space) => space
  );

  // Remove due time markers
  filteredMarkdown = filteredMarkdown.replace(
    new RegExp(`(^|\\s)due:${escapeRegExpStr(timeTrigger)}{([^}]+)}`, 'gm'),
    (_match, space) => space
  );

  filteredMarkdown = filteredMarkdown.replace(
    new RegExp(`(^|\\s)due:${escapeRegExpStr(timeTrigger)}${escapeRegExpStr(timeTrigger)}{([^}]+)}`, 'gm'),
    (_match, space) => space
  );

  // Remove estimate time markers
  filteredMarkdown = filteredMarkdown.replace(
    new RegExp(`(^|\\s)estimate:@{([^}]+)}`, 'gm'),
    (_match, space) => space
  );

  // Clean up multiple consecutive newlines that might be left after filtering
  filteredMarkdown = filteredMarkdown.replace(/\n\s*\n\s*\n/g, '\n\n');

  return filteredMarkdown.trim();
}

export function hydrateItem(stateManager: StateManager, item: Item) {
  const { dateStr, timeStr, duedateStr, duetimeStr, estimatetimeStr, fileAccessor } = item.data.metadata;

  if (dateStr) {
    item.data.metadata.date = moment(dateStr, stateManager.getSetting('date-format'));
  }

  if (timeStr) {
    let time = moment(timeStr, stateManager.getSetting('time-format'));

    if (item.data.metadata.date) {
      const date = item.data.metadata.date;

      date.hour(time.hour());
      date.minute(time.minute());
      date.second(time.second());

      time = date.clone();
    }

    item.data.metadata.time = time;
  }

  if (duedateStr) {
    const duedate = moment(duedateStr, stateManager.getSetting('date-format'));
    if (duedate.isValid()) {
      item.data.metadata.duedate = duedate;
    }
  }

  if (duetimeStr) {
    let duetime = moment(duetimeStr, stateManager.getSetting('time-format'));

    if (duetime.isValid()) {
      if (item.data.metadata.duedate) {
        duetime.year(item.data.metadata.duedate.year());
        duetime.month(item.data.metadata.duedate.month());
        duetime.date(item.data.metadata.duedate.date());
      }

      item.data.metadata.duetime = duetime;
    }
  }

  if (estimatetimeStr) {
    // Parse estimate time as HH:mm format
    const estimatetime = moment(estimatetimeStr, 'HH:mm');
    if (estimatetime.isValid()) {
      item.data.metadata.estimatetime = estimatetime;
    }
  }

  if (fileAccessor) {
    const file = stateManager.app.metadataCache.getFirstLinkpathDest(
      fileAccessor.target,
      stateManager.file.path
    );

    if (file) {
      item.data.metadata.file = file;
    }
  }

  item.data.titleSearch = getSearchValue(item, stateManager);

  return item;
}

export function hydrateBoard(stateManager: StateManager, board: Board): Board {
  try {
    board.children.map((lane) => {
      hydrateLane(stateManager, lane);
      lane.children.map((item) => {
        return hydrateItem(stateManager, item);
      });
    });
  } catch (e) {
    stateManager.setError(e);
    throw e;
  }

  return board;
}

function opAffectsHydration(op: Op) {
  return (
    (op.op === 'add' || op.op === 'replace') &&
    ['title', 'titleRaw', 'dateStr', 'timeStr', /\d$/, /\/fileAccessor\/.+$/].some((postFix) => {
      if (typeof postFix === 'string') {
        return op.path.last().toString().endsWith(postFix);
      } else {
        return postFix.test(op.path.last().toString());
      }
    })
  );
}

export function hydratePostOp(stateManager: StateManager, board: Board, ops: Op[]): Board {
  const seen: Record<string, boolean> = {};
  const toHydrate = ops.reduce((paths, op) => {
    if (!opAffectsHydration(op)) {
      return paths;
    }

    const path = op.path.reduce((path, segment) => {
      if (typeof segment === 'number') {
        path.push(segment);
      }

      return path;
    }, [] as Path);

    const key = path.join(',');

    if (!seen[key]) {
      seen[key] = true;
      paths.push(path);
    }

    return paths;
  }, [] as Path[]);

  toHydrate.map((path) => {
    const entity = getEntityFromPath(board, path);

    if (entity.type === DataTypes.Lane) {
      return hydrateLane(stateManager, entity);
    }

    if (entity.type === DataTypes.Item) {
      return hydrateItem(stateManager, entity);
    }
  });

  return board;
}
