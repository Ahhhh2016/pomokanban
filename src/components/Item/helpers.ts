import { FileWithPath, fromEvent } from 'file-selector';
import { Platform, TFile, TFolder, htmlToMarkdown, moment, parseLinktext, setIcon } from 'obsidian';
import { StateManager } from 'src/StateManager';
import { Path } from 'src/dnd/types';
import { buildLinkToDailyNote } from 'src/helpers';
import { getTaskStatusDone } from 'src/parsers/helpers/inlineMetadata';
import { useContext } from 'preact/hooks';
import { KanbanContext } from '../context';
import { Item } from '../types';

import { BoardModifiers } from '../../helpers/boardModifiers';
import { getDefaultLocale } from '../Editor/datePickerLocale';
import flatpickr from '../Editor/flatpickr';
import { Instance } from '../Editor/flatpickr/types/instance';
import { c, escapeRegExpStr } from '../helpers';
import { t } from '../../lang/helpers';

export function constructDatePicker(
  win: Window,
  stateManager: StateManager,
  coordinates: { x: number; y: number },
  onChange: (dates: Date[]) => void,
  date?: Date
) {
  return win.document.body.createDiv(
    { cls: `${c('date-picker')} ${c('ignore-click-outside')}` },
    (div) => {
      div.style.left = `${coordinates.x || 0}px`;
      div.style.top = `${coordinates.y || 0}px`;

      div.createEl('input', { type: 'text' }, (input) => {
        div.win.setTimeout(() => {
          let picker: Instance | null = null;

          const clickHandler = (e: MouseEvent) => {
            if (
              e.target instanceof (e.view as Window & typeof globalThis).HTMLElement &&
              e.target.closest(`.${c('date-picker')}`) === null
            ) {
              selfDestruct();
            }
          };

          const keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
              selfDestruct();
            }
          };

          const selfDestruct = () => {
            picker.destroy();
            div.remove();
            win.document.body.removeEventListener('click', clickHandler);
            win.document.removeEventListener('keydown', keyHandler);
          };

          picker = flatpickr(input, {
            locale: getDefaultLocale(stateManager),
            defaultDate: date,
            inline: true,
            onChange: (dates) => {
              onChange(dates);
              selfDestruct();
            },
            win,
          });

          div.win.setTimeout(() => {
            const height = div.clientHeight;
            const width = div.clientWidth;

            if (coordinates.y + height > win.innerHeight) {
              div.style.top = `${(coordinates.y || 0) - height}px`;
            }

            if (coordinates.x + width > win.innerWidth) {
              div.style.left = `${(coordinates.x || 0) - width}px`;
            }
          });

          win.document.body.addEventListener('click', clickHandler);
          win.document.addEventListener('keydown', keyHandler);
        });
      });
    }
  );
}

interface ConstructMenuDatePickerOnChangeParams {
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  item: Item;
  hasDate: boolean;
  path: Path;
  coordinates?: { x: number; y: number };
}

export function constructMenuDatePickerOnChange({
  stateManager,
  boardModifiers,
  item,
  hasDate,
  path,
}: ConstructMenuDatePickerOnChangeParams) {
  const dateFormat = stateManager.getSetting('date-format');
  const shouldLinkDates = stateManager.getSetting('link-date-to-daily-note');
  const dateTrigger = stateManager.getSetting('date-trigger');
  const contentMatch = shouldLinkDates
    ? '(?:\\[[^\\]]+\\]\\([^)]+\\)|\\[\\[[^\\]]+\\]\\])'
    : '{[^}]+}';
  const dateRegEx = new RegExp(`(^|\\s)${escapeRegExpStr(dateTrigger as string)}${contentMatch}`);

  return (dates: Date[]) => {
    const date = dates[0];
    const formattedDate = moment(date).format(dateFormat);
    const wrappedDate = shouldLinkDates
      ? buildLinkToDailyNote(stateManager.app, formattedDate)
      : `{${formattedDate}}`;

    let titleRaw = item.data.titleRaw;

    if (hasDate) {
      titleRaw = item.data.titleRaw.replace(dateRegEx, `$1${dateTrigger}${wrappedDate}`);
    } else {
      titleRaw = `${item.data.titleRaw} ${dateTrigger}${wrappedDate}`;
    }

    boardModifiers.updateItem(path, stateManager.updateItemContent(item, titleRaw));
  };
}

export function buildTimeArray(stateManager: StateManager) {
  const format = stateManager.getSetting('time-format');
  const time: string[] = [];

  for (let i = 0; i < 24; i++) {
    time.push(moment({ hour: i }).format(format));
    time.push(moment({ hour: i, minute: 15 }).format(format));
    time.push(moment({ hour: i, minute: 30 }).format(format));
    time.push(moment({ hour: i, minute: 45 }).format(format));
  }

  return time;
}

export function constructTimePicker(
  win: Window,
  stateManager: StateManager,
  coordinates: { x: number; y: number },
  onSelect: (opt: string) => void,
  time?: moment.Moment
) {
  const pickerClassName = c('time-picker');
  const timeFormat = stateManager.getSetting('time-format');
  const selected = time?.format(timeFormat);

  win.document.body.createDiv({ cls: `${pickerClassName} ${c('ignore-click-outside')}` }, (div) => {
    const options = buildTimeArray(stateManager);

    const clickHandler = (e: MouseEvent) => {
      if (
        e.target instanceof (e.view as Window & typeof globalThis).HTMLElement &&
        e.target.hasClass(c('time-picker-item')) &&
        e.target.dataset.value
      ) {
        onSelect(e.target.dataset.value);
        selfDestruct();
      }
    };

    const clickOutsideHandler = (e: MouseEvent) => {
      if (
        e.target instanceof (e.view as Window & typeof globalThis).HTMLElement &&
        e.target.closest(`.${pickerClassName}`) === null
      ) {
        selfDestruct();
      }
    };

    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        selfDestruct();
      }
    };

    const selfDestruct = () => {
      div.remove();
      div.removeEventListener('click', clickHandler);
      win.document.body.removeEventListener('click', clickOutsideHandler);
      win.document.removeEventListener('keydown', escHandler);
    };

    div.style.left = `${coordinates.x || 0}px`;
    div.style.top = `${coordinates.y || 0}px`;

    let selectedItem: HTMLDivElement = null;
    let middleItem: HTMLDivElement = null;

    options.forEach((opt, index) => {
      const isSelected = opt === selected;
      div.createDiv(
        {
          cls: `${c('time-picker-item')} ${isSelected ? 'is-selected' : ''}`,
          text: opt,
        },
        (item) => {
          item.createEl('span', { cls: c('time-picker-check'), prepend: true }, (span) => {
            setIcon(span, 'lucide-check');
          });

          if (index % 4 === 0) {
            item.addClass('is-hour');
          }

          item.dataset.value = opt;

          if (isSelected) selectedItem = item;
          if (index === Math.floor(options.length / 2)) {
            middleItem = item;
          }
        }
      );
    });

    div.win.setTimeout(() => {
      const height = div.clientHeight;
      const width = div.clientWidth;

      if (coordinates.y + height > win.innerHeight) {
        div.style.top = `${(coordinates.y || 0) - height}px`;
      }

      if (coordinates.x + width > win.innerWidth) {
        div.style.left = `${(coordinates.x || 0) - width}px`;
      }

      (selectedItem || middleItem)?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
      });

      div.addEventListener('click', clickHandler);
      win.document.body.addEventListener('click', clickOutsideHandler);
      win.document.addEventListener('keydown', escHandler);
    });
  });
}

interface ConstructMenuTimePickerOnChangeParams {
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  item: Item;
  hasTime: boolean;
  path: Path;
}

export function constructMenuTimePickerOnChange({
  stateManager,
  boardModifiers,
  item,
  hasTime,
  path,
}: ConstructMenuTimePickerOnChangeParams) {
  const timeTrigger = stateManager.getSetting('time-trigger');
  const timeRegEx = new RegExp(`(^|\\s)${escapeRegExpStr(timeTrigger as string)}{([^}]+)}`);

  return (time: string) => {
    let titleRaw = item.data.titleRaw;

    if (hasTime) {
      titleRaw = item.data.titleRaw.replace(timeRegEx, `$1${timeTrigger}{${time}}`);
    } else {
      titleRaw = `${item.data.titleRaw} ${timeTrigger}{${time}}`;
    }

    boardModifiers.updateItem(path, stateManager.updateItemContent(item, titleRaw));
  };
}

interface ConstructMenuDueDatePickerOnChangeParams {
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  item: Item;
  hasDueDate: boolean;
  path: Path;
  coordinates?: { x: number; y: number };
}

export function constructMenuDueDatePickerOnChange({
  stateManager,
  boardModifiers,
  item,
  hasDueDate,
  path,
  coordinates,
}: ConstructMenuDueDatePickerOnChangeParams) {
  const dateFormat = stateManager.getSetting('date-format');
  const timeFormat = stateManager.getSetting('time-format');
  const shouldLinkDates = stateManager.getSetting('link-date-to-daily-note');
  const dateTrigger = stateManager.getSetting('date-trigger');
  const timeTrigger = stateManager.getSetting('time-trigger');
  const contentMatch = shouldLinkDates
    ? '(?:\\[[^\\]]+\\]\\([^)]+\\)|\\[\\[[^\\]]+\\]\\])'
    : '{[^}]+}';
  // Use global flag to match all due dates, not just the first one
  const dueDateRegEx = new RegExp(`(^|\\s)due:${escapeRegExpStr(dateTrigger as string)}${contentMatch}`, 'g');
  const dueTimeRegEx = new RegExp(`(^|\\s)due:${escapeRegExpStr(timeTrigger as string)}{([^}]+)}`, 'g');
  // Also match due:@@{time} format
  const dueTimeDoubleRegEx = new RegExp(`(^|\\s)due:${escapeRegExpStr(timeTrigger as string)}${escapeRegExpStr(timeTrigger as string)}{([^}]+)}`, 'g');

  return (dates: Date[]) => {
    const date = dates[0];
    const formattedDate = moment(date).format(dateFormat);
    const wrappedDate = shouldLinkDates
      ? buildLinkToDailyNote(stateManager.app, formattedDate)
      : `{${formattedDate}}`;

    let titleRaw = item.data.titleRaw;

    if (hasDueDate) {
      // Remove ALL existing due dates and times to prevent duplicates
      titleRaw = item.data.titleRaw.replace(dueDateRegEx, '');
      titleRaw = titleRaw.replace(dueTimeRegEx, '');
      titleRaw = titleRaw.replace(dueTimeDoubleRegEx, '');
      // Preserve line breaks when cleaning up spaces
      titleRaw = titleRaw.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').trim();
      // Add the new due date on a separate line
      titleRaw = `${titleRaw}\ndue:${dateTrigger}${wrappedDate}`;
    } else {
      titleRaw = `${item.data.titleRaw}\ndue:${dateTrigger}${wrappedDate}`;
    }

    // After setting the date, show time picker
    setTimeout(() => {
      // Use the same coordinates as the date picker, or fallback to screen center
      const timePickerCoords = coordinates || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      
      constructTimePicker(
        window,
        stateManager,
        timePickerCoords,
        (time: string) => {
          // Add the new due time on a separate line (we already cleaned any existing time above)
          const finalTitleRaw = `${titleRaw}due:${timeTrigger}{${time}}`;
          
          boardModifiers.updateItem(path, stateManager.updateItemContent(item, finalTitleRaw));
        },
        moment(date)
      );
    }, 100);

    boardModifiers.updateItem(path, stateManager.updateItemContent(item, titleRaw));
  };
}

interface DeleteDueDateParams {
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  item: Item;
  path: Path;
}

export function deleteDueDate({
  stateManager,
  boardModifiers,
  item,
  path,
}: DeleteDueDateParams) {
  const dateTrigger = stateManager.getSetting('date-trigger');
  const timeTrigger = stateManager.getSetting('time-trigger');
  const shouldLinkDates = stateManager.getSetting('link-date-to-daily-note');
  
  const contentMatch = shouldLinkDates
    ? '(?:\\[[^\\]]+\\]\\([^)]+\\)|\\[\\[[^\\]]+\\]\\])'
    : '{[^}]+}';
  
  // Use global flag to match all due dates and times
  const dueDateRegEx = new RegExp(`(^|\\s)due:${escapeRegExpStr(dateTrigger as string)}${contentMatch}`, 'g');
  const dueTimeRegEx = new RegExp(`(^|\\s)due:${escapeRegExpStr(timeTrigger as string)}{([^}]+)}`, 'g');
  // Also match due:@@{time} format
  const dueTimeDoubleRegEx = new RegExp(`(^|\\s)due:${escapeRegExpStr(timeTrigger as string)}${escapeRegExpStr(timeTrigger as string)}{([^}]+)}`, 'g');

  let titleRaw = item.data.titleRaw;

  // Remove ALL existing due dates and times
  titleRaw = titleRaw.replace(dueDateRegEx, '');
  titleRaw = titleRaw.replace(dueTimeRegEx, '');
  titleRaw = titleRaw.replace(dueTimeDoubleRegEx, '');
  
  // Preserve line breaks when cleaning up spaces
  titleRaw = titleRaw.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').trim();

  // Update the item with the cleaned content
  boardModifiers.updateItem(path, stateManager.updateItemContent(item, titleRaw));
}

export function getItemClassModifiers(item: Item) {
  const date = item.data.metadata.date;
  const classModifiers: string[] = [];

  if (date) {
    if (date.isSame(new Date(), 'day')) {
      classModifiers.push('is-today');
    }

    if (date.isAfter(new Date(), 'day')) {
      classModifiers.push('is-future');
    }

    if (date.isBefore(new Date(), 'day')) {
      classModifiers.push('is-past');
    }
  }

  if (item.data.checked && item.data.checkChar === getTaskStatusDone()) {
    classModifiers.push('is-complete');
  }

  // Add is-timing class if the item is being timed
  const { timerManager } = useContext(KanbanContext);
  if (timerManager && timerManager.isRunning(undefined, item.id)) {
    classModifiers.push('is-timing');
  }

  for (const tag of item.data.metadata.tags) {
    classModifiers.push(`has-tag-${tag.slice(1)}`);
  }

  return classModifiers;
}

export function linkTo(
  stateManager: StateManager,
  file: TFile,
  sourcePath: string,
  subpath?: string
) {
  // Generate a link relative to this Kanban board, respecting user link type preferences
  return stateManager.app.fileManager.generateMarkdownLink(file, sourcePath, subpath);
}

export function getMarkdown(html: string) {
  return htmlToMarkdown(html);
}

export function fixLinks(text: string) {
  // Internal links from e.g. dataview plugin incorrectly begin with `app://obsidian.md/`, and
  // we also want to remove bullet points and task markers from text and markdown
  return text.replace(/^\[(.*)\]\(app:\/\/obsidian.md\/(.*)\)$/, '[$1]($2)');
}

interface FileData {
  buffer: ArrayBuffer;
  mimeType: string;
  originalName: string;
}

export function getFileListFromClipboard(win: Window & typeof globalThis) {
  const clipboard = win.require('electron').remote.clipboard;

  if (process.platform === 'darwin') {
    // https://github.com/electron/electron/issues/9035#issuecomment-359554116
    if (clipboard.has('NSFilenamesPboardType')) {
      return (
        (clipboard.read('NSFilenamesPboardType') as string)
          .match(/<string>.*<\/string>/g)
          ?.map((item) => item.replace(/<string>|<\/string>/g, '')) || []
      );
    } else {
      const clipboardImage = clipboard.readImage('clipboard');
      if (!clipboardImage.isEmpty()) {
        const png = clipboardImage.toPNG();
        const fileInfo: FileData = {
          buffer: png,
          mimeType: 'image/png',
          originalName: `Pasted image ${moment().format('YYYYMMDDHHmmss')}.png`,
        };
        return [fileInfo];
      } else {
        return [(clipboard.read('public.file-url') as string).replace('file://', '')].filter(
          (item) => item
        );
      }
    }
  } else {
    // https://github.com/electron/electron/issues/9035#issuecomment-536135202
    // https://docs.microsoft.com/en-us/windows/win32/shell/clipboard#cf_hdrop
    // https://www.codeproject.com/Reference/1091137/Windows-Clipboard-Formats
    if (clipboard.has('CF_HDROP')) {
      const rawFilePathStr = clipboard.read('CF_HDROP') || '';
      let formatFilePathStr = [...rawFilePathStr]
        .filter((_, index) => rawFilePathStr.charCodeAt(index) !== 0)
        .join('')
        .replace(/\\/g, '\\');

      const drivePrefix = formatFilePathStr.match(/[a-zA-Z]:\\/);

      if (drivePrefix) {
        const drivePrefixIndex = formatFilePathStr.indexOf(drivePrefix[0]);
        if (drivePrefixIndex !== 0) {
          formatFilePathStr = formatFilePathStr.slice(drivePrefixIndex);
        }
        return formatFilePathStr
          .split(drivePrefix[0])
          .filter((item) => item)
          .map((item) => drivePrefix + item);
      }
    } else {
      const clipboardImage = clipboard.readImage('clipboard');
      if (!clipboardImage.isEmpty()) {
        const png = clipboardImage.toPNG();
        const fileInfo: FileData = {
          buffer: png,
          mimeType: 'image/png',
          originalName: `Pasted image ${moment().format('YYYYMMDDHHmmss')}.png`,
        };
        return [fileInfo];
      } else {
        return [
          (clipboard.readBuffer('FileNameW').toString('ucs2') as string).replace(
            RegExp(String.fromCharCode(0), 'g'),
            ''
          ),
        ].filter((item) => item);
      }
    }
  }

  return null;
}

function getFileFromPath(file: string) {
  return file.split('\\').pop().split('/').pop();
}

async function linkFromBuffer(
  stateManager: StateManager,
  fileName: string,
  ext: string,
  buffer: ArrayBuffer
) {
  const vaultWithAttachments = stateManager.app.vault as unknown as {
    getAvailablePathForAttachments: (name: string, ext: string, file: TFile) => Promise<string>;
  };
  const path = await vaultWithAttachments.getAvailablePathForAttachments(
    fileName,
    ext,
    stateManager.file
  );

  const newFile = await stateManager.app.vault.createBinary(path, buffer);

  return linkTo(stateManager, newFile, stateManager.file.path);
}

async function handleElectronPaste(stateManager: StateManager, win: Window & typeof globalThis) {
  const list = getFileListFromClipboard(win);

  if (!list || list.length === 0) return null;

  const fs = win.require('fs/promises');
  const nPath = win.require('path');

  return (
    await Promise.all(
      list.map(async (file) => {
        if (typeof file === 'string') {
          const fileStr = getFileFromPath(file);

          const splitFile = fileStr.split('.');
          const ext = splitFile.pop();
          const fileName = splitFile.join('.');

          const vaultWithAttachments = stateManager.app.vault as unknown as {
            getAvailablePathForAttachments: (name: string, ext: string, file: TFile) => Promise<string>;
          };
          const path = await vaultWithAttachments.getAvailablePathForAttachments(
            fileName,
            ext,
            stateManager.file
          );

          const basePath = (stateManager.app.vault.adapter as unknown as { basePath?: string }).basePath;

          await fs.copyFile(file, nPath.join(basePath, path));

          // Wait for Obsidian to update
          await new Promise((resolve) => win.setTimeout(resolve, 50));

          const abstractFile = stateManager.app.vault.getAbstractFileByPath(path);
          if (abstractFile instanceof TFile) {
            return linkTo(stateManager, abstractFile, stateManager.file.path);
          }
          return null;
        } else {
          const splitFile = file.originalName.split('.');
          const ext = splitFile.pop();
          const fileName = splitFile.join('.');

          return await linkFromBuffer(stateManager, fileName, ext, file.buffer);
        }
      })
    )
  ).filter((file) => file);
}

function handleFiles(stateManager: StateManager, files: FileWithPath[], isPaste?: boolean) {
  return Promise.all(
    files.map((file) => {
      const splitFileName = file.name.split('.');

      let ext = splitFileName.pop();
      let fileName = splitFileName.join('.');

      if (isPaste) {
        switch (file.type) {
          case 'text/jpg':
            ext = 'jpg';
            break;
          case 'text/jpeg':
            ext = 'jpeg';
            break;
          case 'text/png':
            ext = 'png';
            break;
        }

        fileName = 'Pasted image ' + moment().format('YYYYMMDDHHmmss');
      }

      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const vaultWithAttachments = stateManager.app.vault as unknown as {
              getAvailablePathForAttachments: (name: string, ext: string, file: TFile) => Promise<string>;
            };
            const path = await vaultWithAttachments.getAvailablePathForAttachments(
              fileName,
              ext,
              stateManager.file
            );
            const newFile = await stateManager.app.vault.createBinary(
              path,
              e.target.result as ArrayBuffer
            );

            resolve(linkTo(stateManager, newFile, stateManager.file.path));
          } catch (e) {
            console.error(e);
            reject(e);
          }
        };
        reader.readAsArrayBuffer(file as FileWithPath);
      });
    })
  );
}

async function handleNullDraggable(
  stateManager: StateManager,
  e: DragEvent | ClipboardEvent,
  win: Window & typeof globalThis
) {
  const isClipboardEvent = (e as DragEvent).view ? false : true;
  const forcePlaintext = isClipboardEvent ? stateManager.getAView().isShiftPressed : false;
  const transfer = isClipboardEvent
    ? (e as ClipboardEvent).clipboardData
    : (e as DragEvent).dataTransfer;
  const clipboard =
    isClipboardEvent && Platform.isDesktopApp ? win.require('electron').remote.clipboard : null;
  const formats = clipboard ? clipboard.availableFormats() : [];

  if (!isClipboardEvent) {
    const files = await fromEvent(e);
    if (files.length) {
      return await handleFiles(stateManager, files as FileWithPath[]);
    }
  } else if (isClipboardEvent && !forcePlaintext && !formats.includes('text/rtf')) {
    if (Platform.isDesktopApp) {
      const links = await handleElectronPaste(stateManager, win);

      if (links?.length) {
        return links;
      }
    }

    const files: File[] = [];
    const items = (e as ClipboardEvent).clipboardData.items;

    for (const index in items) {
      const item = items[index];
      if (item.kind === 'file') {
        files.push(item.getAsFile());
      }
    }

    if (files.length) {
      return await handleFiles(stateManager, files, true);
    }
  }

  const html = transfer.getData('text/html');
  const plain = transfer.getData('text/plain');
  const uris = transfer.getData('text/uri-list');

  const text = forcePlaintext ? plain || html : getMarkdown(html);

  return [fixLinks(text || uris || plain || html || '').trim()];
}

export async function handleDragOrPaste(
  stateManager: StateManager,
  e: DragEvent | ClipboardEvent,
  win: Window & typeof globalThis
): Promise<string[]> {
  const draggable = (stateManager.app as unknown as { dragManager?: { draggable?: any } }).dragManager?.draggable as
    | {
        type: 'file' | 'files' | 'folder' | 'link';
        file?: TFile | TFolder;
        files?: TFile[];
        linktext?: string;
      }
    | undefined;
  const transfer = (e as DragEvent).view
    ? (e as DragEvent).dataTransfer
    : (e as ClipboardEvent).clipboardData;

  switch (draggable?.type) {
    case 'file':
      return [linkTo(stateManager, draggable.file, stateManager.file.path)];
    case 'files':
      return draggable.files.map((f: TFile) => linkTo(stateManager, f, stateManager.file.path));
    case 'folder': {
      return draggable.file.children
        .map((f: TFile | TFolder) => {
          if (f instanceof TFolder) {
            return null;
          }

          return linkTo(stateManager, f, stateManager.file.path);
        })
        .filter((link: string | null) => link);
    }
    case 'link': {
      let link = draggable.file
        ? linkTo(stateManager, draggable.file, parseLinktext(draggable.linktext).subpath)
        : `[[${draggable.linktext}]]`;
      const alias = new DOMParser().parseFromString(transfer.getData('text/html'), 'text/html')
        .documentElement.textContent; // Get raw text
      link = link.replace(/]]$/, `|${alias}]]`).replace(/^\[[^\]].+]\(/, `[${alias}](`);
      return [link];
    }
    default: {
      return await handleNullDraggable(stateManager, e, win);
    }
  }
}

// Estimate Time Functions
interface ConstructEstimateTimeInputParams {
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  item: Item;
  hasEstimateTime: boolean;
  path: Path;
  coordinates?: { x: number; y: number };
}

export function constructEstimateTimeInput({
  stateManager,
  boardModifiers,
  item,
  hasEstimateTime,
  path,
  coordinates,
}: ConstructEstimateTimeInputParams) {
  return (win: Window) => {
    const modal = win.document.body.createDiv(
      { cls: `${c('estimate-time-modal')} ${c('ignore-click-outside')}` },
      (div) => {
        // Position the modal
        div.style.left = `${coordinates?.x || 0}px`;
        div.style.top = `${coordinates?.y || 0}px`;

        // Title
        div.createEl('h3', { 
          text: hasEstimateTime ? t('Modify estimate time') : t('Add estimate time'),
          cls: 'modal-title'
        });

        // Time inputs container with grid layout
        const timeInputsContainer = div.createDiv({ cls: 'time-inputs' });

        // Hours input
        const hoursContainer = timeInputsContainer.createDiv({ cls: 'input-container' });
        hoursContainer.createEl('label', { text: t('Hours') + ':', cls: 'input-label' });
        const hoursInput = hoursContainer.createEl('input', {
          type: 'number',
          value: hasEstimateTime && item.data.metadata.estimatetime 
            ? item.data.metadata.estimatetime.format('H') 
            : '0',
          cls: 'input-field'
        });
        hoursInput.setAttribute('min', '0');
        hoursInput.setAttribute('max', '23');

        // Minutes input
        const minutesContainer = timeInputsContainer.createDiv({ cls: 'input-container' });
        minutesContainer.createEl('label', { text: t('Minutes') + ':', cls: 'input-label' });
        const minutesInput = minutesContainer.createEl('input', {
          type: 'number',
          value: hasEstimateTime && item.data.metadata.estimatetime 
            ? item.data.metadata.estimatetime.format('m') 
            : '0',
          cls: 'input-field'
        });
        minutesInput.setAttribute('min', '0');
        minutesInput.setAttribute('max', '59');

        // Buttons container
        const buttonsContainer = div.createDiv({ cls: 'buttons-container' });
        
        const saveButton = buttonsContainer.createEl('button', {
          text: t('Save'),
          cls: 'mod-cta'
        });

        const cancelButton = buttonsContainer.createEl('button', {
          text: t('Cancel'),
          cls: 'mod-secondary'
        });

        if (hasEstimateTime) {
          const deleteButton = buttonsContainer.createEl('button', {
            text: t('Delete'),
            cls: 'mod-warning'
          });

          deleteButton.onclick = () => {
            deleteEstimateTime({ stateManager, boardModifiers, item, path });
            modal.remove();
          };
        }

        // Event handlers
        const saveEstimateTime = () => {
          const hours = parseInt(hoursInput.value) || 0;
          const minutes = parseInt(minutesInput.value) || 0;
          
          // Input validation
          if (hours < 0 || hours > 23) {
            // Show error message
            const errorMsg = div.querySelector('.error-message');
            if (errorMsg) errorMsg.remove();
            
            const errorDiv = div.createDiv({ cls: 'error-message' });
            errorDiv.style.color = 'var(--text-error)';
            errorDiv.style.fontSize = '12px';
            errorDiv.style.marginTop = '8px';
            errorDiv.textContent = t('Hours must be between 0 and 23');
            return;
          }
          
          if (minutes < 0 || minutes > 59) {
            // Show error message
            const errorMsg = div.querySelector('.error-message');
            if (errorMsg) errorMsg.remove();
            
            const errorDiv = div.createDiv({ cls: 'error-message' });
            errorDiv.style.color = 'var(--text-error)';
            errorDiv.style.fontSize = '12px';
            errorDiv.style.marginTop = '8px';
            errorDiv.textContent = t('Minutes must be between 0 and 59');
            return;
          }
          
          // Clear any existing error messages
          const errorMsg = div.querySelector('.error-message');
          if (errorMsg) errorMsg.remove();
          
          if (hours === 0 && minutes === 0) {
            // If both are 0, treat as delete
            deleteEstimateTime({ stateManager, boardModifiers, item, path });
          } else {
            // Create estimate time string in HH:mm format
            const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            const estimateTimeStr = `estimate:@{${timeString}}`;
            
            let titleRaw = item.data.titleRaw;
            
            if (hasEstimateTime) {
              // Remove existing estimate time
              const estimateTimeRegEx = /(^|\s)estimate:@{[^}]+}/g;
              titleRaw = titleRaw.replace(estimateTimeRegEx, '');
              // Preserve line breaks when cleaning up spaces
              titleRaw = titleRaw.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').trim();
            }
            
            // Add new estimate time with proper line break
            titleRaw = `${titleRaw}\n${estimateTimeStr}`;
            
            boardModifiers.updateItem(path, stateManager.updateItemContent(item, titleRaw));
          }
          
          modal.remove();
        };

        saveButton.onclick = saveEstimateTime;
        cancelButton.onclick = () => modal.remove();

        // Handle Enter key
        const handleKeydown = (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            saveEstimateTime();
          } else if (e.key === 'Escape') {
            modal.remove();
          }
        };

        hoursInput.addEventListener('keydown', handleKeydown);
        minutesInput.addEventListener('keydown', handleKeydown);

        // Focus on hours input
        setTimeout(() => hoursInput.focus(), 0);
      }
    );

    // Close modal when clicking outside
    const clickHandler = (e: MouseEvent) => {
      if (e.target instanceof HTMLElement && !modal.contains(e.target)) {
        modal.remove();
        win.document.body.removeEventListener('click', clickHandler);
      }
    };

    setTimeout(() => {
      win.document.body.addEventListener('click', clickHandler);
    }, 0);
  };
}

interface DeleteEstimateTimeParams {
  stateManager: StateManager;
  boardModifiers: BoardModifiers;
  item: Item;
  path: Path;
}

export function deleteEstimateTime({
  stateManager,
  boardModifiers,
  item,
  path,
}: DeleteEstimateTimeParams) {
  const estimateTimeRegEx = /(^|\s)estimate:@{[^}]+}/g;
  
  let titleRaw = item.data.titleRaw;
  
  // Remove existing estimate time
  titleRaw = titleRaw.replace(estimateTimeRegEx, '');
  
  // Preserve line breaks when cleaning up spaces
  titleRaw = titleRaw.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').trim();

  // Update the item with the cleaned content
  boardModifiers.updateItem(path, stateManager.updateItemContent(item, titleRaw));
}
