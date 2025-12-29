import { App, TFile } from 'obsidian';
import { getDailyNoteSettings, getDateFromFile } from 'obsidian-daily-notes-interface';

import { frontmatterKey } from './parsers/common';

export function gotoNextDailyNote(app: App, file: TFile) {
  const date = getDateFromFile(file, 'day');

  if (!date || !date.isValid()) {
    return;
  }

  const dailyNotePlugin = (app as unknown as {
    internalPlugins?: { plugins?: { ['daily-notes']?: { instance?: { gotoNextExisting: (d: any) => void } } } };
  }).internalPlugins?.plugins?.['daily-notes']?.instance;

  dailyNotePlugin?.gotoNextExisting?.(date);
}

export function gotoPrevDailyNote(app: App, file: TFile) {
  const date = getDateFromFile(file, 'day');

  if (!date || !date.isValid()) {
    return;
  }

  const dailyNotePlugin = (app as unknown as {
    internalPlugins?: { plugins?: { ['daily-notes']?: { instance?: { gotoPreviousExisting: (d: any) => void } } } };
  }).internalPlugins?.plugins?.['daily-notes']?.instance;

  dailyNotePlugin?.gotoPreviousExisting?.(date);
}

export function buildLinkToDailyNote(app: App, dateStr: string) {
  const dailyNoteSettings = getDailyNoteSettings();
  const shouldUseMarkdownLinks = !!(
    (window as unknown as { app: { vault: { getConfig: (k: string) => unknown } } }).app.vault.getConfig(
      'useMarkdownLinks'
    )
  );

  if (shouldUseMarkdownLinks) {
    return `[${dateStr}](${
      dailyNoteSettings.folder ? `${encodeURIComponent(dailyNoteSettings.folder)}/` : ''
    }${encodeURIComponent(dateStr)}.md)`;
  }

  return `[[${dateStr}]]`;
}

export function hasFrontmatterKeyRaw(data: string) {
  if (!data) return false;

  const match = data.match(/---\s+([\w\W]+?)\s+---/);

  if (!match) {
    return false;
  }

  if (!match[1].contains(frontmatterKey)) {
    return false;
  }

  return true;
}

export function hasFrontmatterKey(file: TFile) {
  if (!file) return false;
  const cache = (window as unknown as { app: { metadataCache: { getFileCache: (f: TFile) => unknown } } }).app
    .metadataCache.getFileCache(file);
  return !!cache?.frontmatter?.[frontmatterKey];
}

export function laneTitleWithMaxItems(title: string, maxItems?: number) {
  if (!maxItems) return title;
  return `${title} (${maxItems})`;
}
