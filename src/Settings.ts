import update, { Spec } from 'immutability-helper';
import {
  App,
  DropdownComponent,
  Modal,
  PluginSettingTab,
  Setting,
  ToggleComponent,
  TextComponent,
} from 'obsidian';

import { KanbanView } from './KanbanView';
import {
  c,
  generateInstanceId,
  getDefaultDateFormat,
  getDefaultTimeFormat,
} from './components/helpers';
import {
  DataKey,
  DateColor,
  DateColorSetting,
  DateColorSettingTemplate,
  MetadataSetting,
  MetadataSettingTemplate,
  TagColor,
  TagColorSetting,
  TagColorSettingTemplate,
  TagSort,
  TagSortSetting,
  TagSortSettingTemplate,
} from './components/types';
import { getParentWindow } from './dnd/util/getWindow';
import { t } from './lang/helpers';
import KanbanPlugin from './main';
import { frontmatterKey } from './parsers/common';
import {
  createSearchSelect,
  defaultDateTrigger,
  defaultMetadataPosition,
  defaultTimeTrigger,
  getListOptions,
} from './settingHelpers';
import { cleanUpDateSettings, renderDateSettings } from './settings/DateColorSettings';
import { cleanupMetadataSettings, renderMetadataSettings } from './settings/MetadataSettings';
import { cleanUpTagSettings, renderTagSettings } from './settings/TagColorSettings';
import { cleanUpTagSortSettings, renderTagSortSettings } from './settings/TagSortSettings';
import { renderInterruptReasonSettings, cleanUpInterruptReasonSettings } from './settings/InterruptReasonSettings';

const numberRegEx = /^\d+(?:\.\d+)?$/;

// Default interrupt reasons
export const DEFAULT_INTERRUPT_REASONS = [
  'Boss interrupted',
  'Colleague interrupted',
  'Email',
  'Going home',
  'Lunch',
  'Phone call',
  'Web browsing',
  'Task done',
];

export type KanbanFormat = 'basic' | 'board' | 'table' | 'list';

export interface KanbanSettings {
  [frontmatterKey]?: KanbanFormat;
  'append-archive-date'?: boolean;
  'archive-date-format'?: string;
  'archive-date-separator'?: string;
  'archive-with-date'?: boolean;
  'date-colors'?: DateColor[];
  'date-display-format'?: string;
  'date-format'?: string;
  'date-picker-week-start'?: number;
  'date-time-display-format'?: string;
  'date-trigger'?: string;
  'full-list-lane-width'?: boolean;
  'hide-card-count'?: boolean;
  'inline-metadata-position'?: 'body' | 'footer' | 'metadata-table';
  'lane-width'?: number;
  'link-date-to-daily-note'?: boolean;
  'list-collapse'?: boolean[];
  'max-archive-size'?: number;
  'metadata-keys'?: DataKey[];
  'move-dates'?: boolean;
  'move-tags'?: boolean;
  'move-task-metadata'?: boolean;
  'new-card-insertion-method'?: 'prepend' | 'prepend-compact' | 'append';
  'new-line-trigger'?: 'enter' | 'shift-enter';
  'new-note-folder'?: string;
  'new-note-template'?: string;
  'show-add-list'?: boolean;
  'show-archive-all'?: boolean;
  'show-board-settings'?: boolean;
  'show-checkboxes'?: boolean;
  'show-relative-date'?: boolean;
  'show-search'?: boolean;
  'show-set-view'?: boolean;
  'hide-timelog'?: boolean;
  'show-view-as-markdown'?: boolean;
  'table-sizing'?: Record<string, number>;
  'tag-action'?: 'kanban' | 'obsidian';
  'tag-colors'?: TagColor[];
  'tag-sort'?: TagSort[];
  'time-format'?: string;
  'time-trigger'?: string;

  /* ================= Timer Settings ================= */
  /** Pomodoro duration in minutes */
  'timer-pomodoro'?: number;
  /** Short break duration in minutes */
  'timer-short-break'?: number;
  /** Long break duration in minutes */
  'timer-long-break'?: number;
  /** Number of pomodoros before a long break */
  'timer-long-break-interval'?: number;
  /** Number of automatic pomodoro rounds (0 = disabled) */
  'timer-auto-rounds'?: number;
  /** List of interrupt reasons */
  'timer-interrupts'?: string[];
  /** Enable notification sounds */
  'timer-enable-sounds'?: boolean;
  /** Volume percentage (0-100) for sounds */
  'timer-sound-volume'?: number;
  /** Custom sound file path for timer notifications */
  'timer-sound-file'?: string;
  /** Show timelog entries */
  'show-timelog'?: boolean;
}

export interface KanbanViewSettings {
  [frontmatterKey]?: KanbanFormat;
  'list-collapse'?: boolean[];
}

export const settingKeyLookup: Set<keyof KanbanSettings> = new Set([
  frontmatterKey,
  'append-archive-date',
  'archive-date-format',
  'archive-date-separator',
  'archive-with-date',
  'date-colors',
  'date-display-format',
  'date-format',
  'date-picker-week-start',
  'date-time-display-format',
  'date-trigger',
  'full-list-lane-width',
  'hide-card-count',
  'inline-metadata-position',
  'lane-width',
  'link-date-to-daily-note',
  'list-collapse',
  'max-archive-size',
  'metadata-keys',
  'move-dates',
  'move-tags',
  'move-task-metadata',
  'new-card-insertion-method',
  'new-line-trigger',
  'new-note-folder',
  'new-note-template',
  'show-add-list',
  'show-archive-all',
  'show-board-settings',
  'show-checkboxes',
  'show-relative-date',
  'show-search',
  'show-set-view',
  'hide-timelog',
  'show-view-as-markdown',
  'table-sizing',
  'tag-action',
  'tag-colors',
  'tag-sort',
  'time-format',
  'time-trigger',
  /* ===== Timer Settings ===== */
  'timer-pomodoro',
  'timer-short-break',
  'timer-long-break',
  'timer-long-break-interval',
  'timer-auto-rounds',
  'timer-interrupts',
  'timer-enable-sounds',
  'timer-sound-volume',
  'timer-sound-file',
  'show-timelog',
]);

export type SettingRetriever = <K extends keyof KanbanSettings>(
  key: K,
  supplied?: KanbanSettings
) => KanbanSettings[K];

export interface SettingRetrievers {
  getGlobalSettings: () => KanbanSettings;
  getGlobalSetting: SettingRetriever;
  getSetting: SettingRetriever;
}

export interface SettingsManagerConfig {
  onSettingsChange: (newSettings: KanbanSettings) => void;
}

export class SettingsManager {
  win: Window;
  app: App;
  plugin: KanbanPlugin;
  config: SettingsManagerConfig;
  settings: KanbanSettings;
  cleanupFns: Array<() => void> = [];
  applyDebounceTimer: number = 0;

  constructor(plugin: KanbanPlugin, config: SettingsManagerConfig, settings: KanbanSettings) {
    this.app = plugin.app;
    this.plugin = plugin;
    this.config = config;
    this.settings = settings;
  }

  applySettingsUpdate(spec: Spec<KanbanSettings>) {
    this.win.clearTimeout(this.applyDebounceTimer);

    this.applyDebounceTimer = this.win.setTimeout(() => {
      this.settings = update(this.settings, spec);
      this.config.onSettingsChange(this.settings);
    }, 1000);
  }

  getSetting(key: keyof KanbanSettings, local: boolean) {
    if (local) {
      return [this.settings[key], this.plugin.settings[key]];
    }

    return [this.settings[key], null];
  }

  constructUI(contentEl: HTMLElement, heading: string, local: boolean) {
    this.win = contentEl.win;

    const { templateFiles, vaultFolders, templateWarning } = getListOptions(this.app);

    contentEl.createEl('h3', { text: heading });

    if (local) {
      contentEl.createEl('p', {
        text: t('These settings will take precedence over the default Kanban board settings.'),
      });
    } else {
      contentEl.createEl('p', {
        text: t(
          'Set the default Kanban board settings. Settings can be overridden on a board-by-board basis.'
        ),
      });
    }

    new Setting(contentEl)
      .setName(t('Display card checkbox'))
      .setDesc(t('When toggled, a checkbox will be displayed with each card'))
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('show-checkboxes', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'show-checkboxes': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('show-checkboxes', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['show-checkboxes'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('New line trigger'))
      .setDesc(
        t(
          'Select whether Enter or Shift+Enter creates a new line. The opposite of what you choose will create and complete editing of cards and lists.'
        )
      )
      .addDropdown((dropdown) => {
        dropdown.addOption('shift-enter', t('Shift + Enter'));
        dropdown.addOption('enter', t('Enter'));

        const [value, globalValue] = this.getSetting('new-line-trigger', local);

        dropdown.setValue((value as string) || (globalValue as string) || 'shift-enter');
        dropdown.onChange((value) => {
          this.applySettingsUpdate({
            'new-line-trigger': {
              $set: value as 'enter' | 'shift-enter',
            },
          });
        });
      });

    new Setting(contentEl)
      .setName(t('Prepend / append new cards'))
      .setDesc(
        t('This setting controls whether new cards are added to the beginning or end of the list.')
      )
      .addDropdown((dropdown) => {
        dropdown.addOption('prepend', t('Prepend'));
        dropdown.addOption('prepend-compact', t('Prepend (compact)'));
        dropdown.addOption('append', t('Append'));

        const [value, globalValue] = this.getSetting('new-card-insertion-method', local);

        dropdown.setValue((value as string) || (globalValue as string) || 'append');
        dropdown.onChange((value) => {
          this.applySettingsUpdate({
            'new-card-insertion-method': {
              $set: value as 'prepend' | 'append',
            },
          });
        });
      });

    new Setting(contentEl)
      .setName(t('Hide card counts in list titles'))
      .setDesc(t('When toggled, card counts are hidden from the list title'))
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('hide-card-count', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'hide-card-count': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('hide-card-count', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['hide-card-count'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('List width'))
      .setDesc(t('Enter a number to set the list width in pixels.'))
      .addText((text) => {
        const [value, globalValue] = this.getSetting('lane-width', local);

        text.inputEl.setAttr('type', 'number');
        const laneWidthDefault =
          typeof globalValue === 'number' || typeof globalValue === 'string'
            ? String(globalValue)
            : '310';
        text.inputEl.placeholder = `${laneWidthDefault} (default)`;
        text.inputEl.value =
          typeof value === 'number' || typeof value === 'string' ? String(value) : '';

        text.onChange((val) => {
          if (val && numberRegEx.test(val)) {
            text.inputEl.removeClass('error');

            this.applySettingsUpdate({
              'lane-width': {
                $set: parseInt(val),
              },
            });

            return;
          }

          if (val) {
            text.inputEl.addClass('error');
          }

          this.applySettingsUpdate({
            $unset: ['lane-width'],
          });
        });
      });

    new Setting(contentEl).setName(t('Expand lists to full width in list view')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('full-list-lane-width', local);

          if (value !== undefined) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined) {
            toggle.setValue(globalValue as boolean);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'full-list-lane-width': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('full-list-lane-width', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['full-list-lane-width'],
              });
            });
        });
    });

    new Setting(contentEl)
      .setName(t('Maximum number of archived cards'))
      .setDesc(
        t(
          "Archived cards can be viewed in markdown mode. This setting will begin removing old cards once the limit is reached. Setting this value to -1 will allow a board's archive to grow infinitely."
        )
      )
      .addText((text) => {
        const [value, globalValue] = this.getSetting('max-archive-size', local);

        text.inputEl.setAttr('type', 'number');
        const maxArchiveDefault =
          typeof globalValue === 'number' || typeof globalValue === 'string'
            ? String(globalValue)
            : '-1';
        text.inputEl.placeholder = `${maxArchiveDefault} (default)`;
        text.inputEl.value =
          typeof value === 'number' || typeof value === 'string' ? String(value) : '';

        text.onChange((val) => {
          if (val && numberRegEx.test(val)) {
            text.inputEl.removeClass('error');

            this.applySettingsUpdate({
              'max-archive-size': {
                $set: parseInt(val),
              },
            });

            return;
          }

          if (val) {
            text.inputEl.addClass('error');
          }

          this.applySettingsUpdate({
            $unset: ['max-archive-size'],
          });
        });
      });

    new Setting(contentEl)
      .setName(t('Note template'))
      .setDesc(t('This template will be used when creating new notes from Kanban cards.'))
      .then(
        createSearchSelect({
          choices: templateFiles,
          key: 'new-note-template',
          warningText: templateWarning,
          local,
          placeHolderStr: t('No template'),
          manager: this,
        })
      );

    new Setting(contentEl)
      .setName(t('Note folder'))
      .setDesc(
        t(
          'Notes created from Kanban cards will be placed in this folder. If blank, they will be placed in the default location for this vault.'
        )
      )
      .then(
        createSearchSelect({
          choices: vaultFolders,
          key: 'new-note-folder',
          local,
          placeHolderStr: t('Default folder'),
          manager: this,
        })
      );

    contentEl.createEl('h4', { text: t('Tags') });

    new Setting(contentEl)
      .setName(t('Move tags to card footer'))
      .setDesc(
        t("When toggled, tags will be displayed in the card's footer instead of the card's body.")
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('move-tags', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'move-tags': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('move-tags', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['move-tags'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('Tag click action'))
      .setDesc(
        t(
          'This setting controls whether clicking the tags displayed below the card title opens the Obsidian search or the Kanban board search.'
        )
      )
      .addDropdown((dropdown) => {
        dropdown.addOption('kanban', t('Search Kanban Board'));
        dropdown.addOption('obsidian', t('Search Obsidian Vault'));

        const [value, globalValue] = this.getSetting('tag-action', local);

        dropdown.setValue((value as string) || (globalValue as string) || 'obsidian');
        dropdown.onChange((value) => {
          this.applySettingsUpdate({
            'tag-action': {
              $set: value as 'kanban' | 'obsidian',
            },
          });
        });
      });

    new Setting(contentEl).then((setting) => {
      const [value] = this.getSetting('tag-sort', local);

      const keys: TagSortSetting[] = ((value || []) as TagSort[]).map((k) => {
        return {
          ...TagSortSettingTemplate,
          id: generateInstanceId(),
          data: k,
        };
      });

      renderTagSortSettings(setting.settingEl, contentEl, keys, (keys: TagSortSetting[]) =>
        this.applySettingsUpdate({
          'tag-sort': {
            $set: keys.map((k) => k.data),
          },
        })
      );

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanUpTagSortSettings(setting.settingEl);
        }
      });
    });

    new Setting(contentEl).then((setting) => {
      const [value] = this.getSetting('tag-colors', local);

      const keys: TagColorSetting[] = ((value || []) as TagColor[]).map((k) => {
        return {
          ...TagColorSettingTemplate,
          id: generateInstanceId(),
          data: k,
        };
      });

      renderTagSettings(setting.settingEl, keys, (keys: TagColorSetting[]) =>
        this.applySettingsUpdate({
          'tag-colors': {
            $set: keys.map((k) => k.data),
          },
        })
      );

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanUpTagSettings(setting.settingEl);
        }
      });
    });

    contentEl.createEl('h4', { text: t('Date & Time') });

    new Setting(contentEl)
      .setName(t('Move dates to card footer'))
      .setDesc(
        t("When toggled, dates will be displayed in the card's footer instead of the card's body.")
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('move-dates', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'move-dates': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('move-dates', local);
                toggleComponent.setValue((globalValue as boolean) ?? true);

                this.applySettingsUpdate({
                  $unset: ['move-dates'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('Date trigger'))
      .setDesc(t('When this is typed, it will trigger the date selector'))
      .addText((text) => {
        const [value, globalValue] = this.getSetting('date-trigger', local);

        if (value || globalValue) {
          text.setValue((value || globalValue) as string);
        }

        text.setPlaceholder((globalValue as string) || defaultDateTrigger);

        text.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'date-trigger': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['date-trigger'],
            });
          }
        });
      });

    new Setting(contentEl)
      .setName(t('Time trigger'))
      .setDesc(t('When this is typed, it will trigger the time selector'))
      .addText((text) => {
        const [value, globalValue] = this.getSetting('time-trigger', local);

        if (value || globalValue) {
          text.setValue((value || globalValue) as string);
        }

        text.setPlaceholder((globalValue as string) || defaultTimeTrigger);

        text.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'time-trigger': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['time-trigger'],
            });
          }
        });
      });

    new Setting(contentEl).setName(t('Date format')).then((setting) => {
      setting.addMomentFormat((mf) => {
        setting.descEl.appendChild(
          createFragment((frag) => {
            frag.appendText(t('This format will be used when saving dates in markdown.'));
            frag.createEl('br');
            frag.appendText(t('For more syntax, refer to') + ' ');
            frag.createEl(
              'a',
              {
                text: t('format reference'),
                href: 'https://momentjs.com/docs/#/displaying/format/',
              },
              (a) => {
                a.setAttr('target', '_blank');
              }
            );
            frag.createEl('br');
            frag.appendText(t('Your current syntax looks like this') + ': ');
            mf.setSampleEl(frag.createEl('b', { cls: 'u-pop' }));
            frag.createEl('br');
          })
        );

        const [value, globalValue] = this.getSetting('date-format', local);
        const defaultFormat = getDefaultDateFormat(this.app);

        mf.setPlaceholder(defaultFormat);
        mf.setDefaultFormat(defaultFormat);

        if (value || globalValue) {
          mf.setValue((value || globalValue) as string);
        }

        mf.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'date-format': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['date-format'],
            });
          }
        });
      });
    });

    new Setting(contentEl).setName(t('Time format')).then((setting) => {
      setting.addMomentFormat((mf) => {
        setting.descEl.appendChild(
          createFragment((frag) => {
            frag.appendText(t('For more syntax, refer to') + ' ');
            frag.createEl(
              'a',
              {
                text: t('format reference'),
                href: 'https://momentjs.com/docs/#/displaying/format/',
              },
              (a) => {
                a.setAttr('target', '_blank');
              }
            );
            frag.createEl('br');
            frag.appendText(t('Your current syntax looks like this') + ': ');
            mf.setSampleEl(frag.createEl('b', { cls: 'u-pop' }));
            frag.createEl('br');
          })
        );

        const [value, globalValue] = this.getSetting('time-format', local);
        const defaultFormat = getDefaultTimeFormat(this.app);

        mf.setPlaceholder(defaultFormat);
        mf.setDefaultFormat(defaultFormat);

        if (value || globalValue) {
          mf.setValue((value || globalValue) as string);
        }

        mf.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'time-format': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['time-format'],
            });
          }
        });
      });
    });

    new Setting(contentEl).setName(t('Date display format')).then((setting) => {
      setting.addMomentFormat((mf) => {
        setting.descEl.appendChild(
          createFragment((frag) => {
            frag.appendText(t('This format will be used when displaying dates in Kanban cards.'));
            frag.createEl('br');
            frag.appendText(t('For more syntax, refer to') + ' ');
            frag.createEl(
              'a',
              {
                text: t('format reference'),
                href: 'https://momentjs.com/docs/#/displaying/format/',
              },
              (a) => {
                a.setAttr('target', '_blank');
              }
            );
            frag.createEl('br');
            frag.appendText(t('Your current syntax looks like this') + ': ');
            mf.setSampleEl(frag.createEl('b', { cls: 'u-pop' }));
            frag.createEl('br');
          })
        );

        const [value, globalValue] = this.getSetting('date-display-format', local);
        const defaultFormat = getDefaultDateFormat(this.app);

        mf.setPlaceholder(defaultFormat);
        mf.setDefaultFormat(defaultFormat);

        if (value || globalValue) {
          mf.setValue((value || globalValue) as string);
        }

        mf.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'date-display-format': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['date-display-format'],
            });
          }
        });
      });
    });

    new Setting(contentEl)
      .setName(t('Show relative date'))
      .setDesc(
        t(
          "When toggled, cards will display the distance between today and the card's date. eg. 'In 3 days', 'A month ago'. Relative dates will not be shown for dates from the Tasks and Dataview plugins."
        )
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('show-relative-date', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'show-relative-date': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('show-relative-date', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['show-relative-date'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('Link dates to daily notes'))
      .setDesc(t('When toggled, dates will link to daily notes. Eg. [[2021-04-26]]'))
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('link-date-to-daily-note', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'link-date-to-daily-note': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('link-date-to-daily-note', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['link-date-to-daily-note'],
                });
              });
          });
      });

    new Setting(contentEl).then((setting) => {
      const [value] = this.getSetting('date-colors', local);

      const keys: DateColorSetting[] = ((value || []) as DateColor[]).map((k) => {
        return {
          ...DateColorSettingTemplate,
          id: generateInstanceId(),
          data: k,
        };
      });

      renderDateSettings(
        setting.settingEl,
        keys,
        (keys: DateColorSetting[]) =>
          this.applySettingsUpdate({
            'date-colors': {
              $set: keys.map((k) => k.data),
            },
          }),
        () => {
          const [value, globalValue] = this.getSetting('date-display-format', local);
          const defaultFormat = getDefaultDateFormat(this.app);
          return value || globalValue || defaultFormat;
        },
        () => {
          const [value, globalValue] = this.getSetting('time-format', local);
          const defaultFormat = getDefaultTimeFormat(this.app);
          return value || globalValue || defaultFormat;
        }
      );

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanUpDateSettings(setting.settingEl);
        }
      });
    });

    new Setting(contentEl)
      .setName(t('Add date and time to archived cards'))
      .setDesc(
        t(
          'When toggled, the current date and time will be added to the card title when it is archived. Eg. - [ ] 2021-05-14 10:00am My card title'
        )
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('archive-with-date', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'archive-with-date': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('archive-with-date', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['archive-with-date'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('Add archive date/time after card title'))
      .setDesc(
        t(
          'When toggled, the archived date/time will be added after the card title, e.g.- [ ] My card title 2021-05-14 10:00am. By default, it is inserted before the title.'
        )
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('append-archive-date', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'append-archive-date': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('append-archive-date', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['append-archive-date'],
                });
              });
          });
      });

    new Setting(contentEl)
      .setName(t('Archive date/time separator'))
      .setDesc(t('This will be used to separate the archived date/time from the title'))
      .addText((text) => {
        const [value, globalValue] = this.getSetting('archive-date-separator', local);

        const sepPlaceholder =
          typeof globalValue === 'string' || typeof globalValue === 'number'
            ? `${String(globalValue)} (default)`
            : '';
        text.inputEl.placeholder = sepPlaceholder;
        text.inputEl.value = typeof value === 'string' ? value : '';

        text.onChange((val) => {
          if (val) {
            this.applySettingsUpdate({
              'archive-date-separator': {
                $set: val,
              },
            });

            return;
          }

          this.applySettingsUpdate({
            $unset: ['archive-date-separator'],
          });
        });
      });

    new Setting(contentEl).setName(t('Archive date/time format')).then((setting) => {
      setting.addMomentFormat((mf) => {
        setting.descEl.appendChild(
          createFragment((frag) => {
            frag.appendText(t('For more syntax, refer to') + ' ');
            frag.createEl(
              'a',
              {
                text: t('format reference'),
                href: 'https://momentjs.com/docs/#/displaying/format/',
              },
              (a) => {
                a.setAttr('target', '_blank');
              }
            );
            frag.createEl('br');
            frag.appendText(t('Your current syntax looks like this') + ': ');
            mf.setSampleEl(frag.createEl('b', { cls: 'u-pop' }));
            frag.createEl('br');
          })
        );

        const [value, globalValue] = this.getSetting('archive-date-format', local);

        const [dateFmt, globalDateFmt] = this.getSetting('date-format', local);
        const defaultDateFmt = dateFmt || globalDateFmt || getDefaultDateFormat(this.app);
        const [timeFmt, globalTimeFmt] = this.getSetting('time-format', local);
        const defaultTimeFmt = timeFmt || globalTimeFmt || getDefaultTimeFormat(this.app);

        const defaultFormat = `${defaultDateFmt} ${defaultTimeFmt}`;

        mf.setPlaceholder(defaultFormat);
        mf.setDefaultFormat(defaultFormat);

        if (value || globalValue) {
          mf.setValue((value || globalValue) as string);
        }

        mf.onChange((newValue) => {
          if (newValue) {
            this.applySettingsUpdate({
              'archive-date-format': {
                $set: newValue,
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['archive-date-format'],
            });
          }
        });
      });
    });

    new Setting(contentEl)
      .setName(t('Calendar: first day of week'))
      .setDesc(t('Override which day is used as the start of the week'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('default'));
        dropdown.addOption('0', t('Sunday'));
        dropdown.addOption('1', t('Monday'));
        dropdown.addOption('2', t('Tuesday'));
        dropdown.addOption('3', t('Wednesday'));
        dropdown.addOption('4', t('Thursday'));
        dropdown.addOption('5', t('Friday'));
        dropdown.addOption('6', t('Saturday'));

        const [value, globalValue] = this.getSetting('date-picker-week-start', local);

        dropdown.setValue(value?.toString() || globalValue?.toString() || '');
        dropdown.onChange((value) => {
          if (value) {
            this.applySettingsUpdate({
              'date-picker-week-start': {
                $set: Number(value),
              },
            });
          } else {
            this.applySettingsUpdate({
              $unset: ['date-picker-week-start'],
            });
          }
        });
      });

    contentEl.createEl('br');
    contentEl.createEl('h4', { text: t('Inline Metadata') });

    new Setting(contentEl)
      .setName(t('Inline metadata position'))
      .setDesc(
        t('Controls where the inline metadata (from the Dataview plugin) will be displayed.')
      )
      .then((s) => {
        let input: DropdownComponent;

        s.addDropdown((dropdown) => {
          input = dropdown;

          dropdown.addOption('body', t('Card body'));
          dropdown.addOption('footer', t('Card footer'));
          dropdown.addOption('metadata-table', t('Merge with linked page metadata'));

          const [value, globalValue] = this.getSetting('inline-metadata-position', local);

          dropdown.setValue(
            value?.toString() || globalValue?.toString() || defaultMetadataPosition
          );
          dropdown.onChange((value: 'body' | 'footer' | 'metadata-table') => {
            if (value) {
              this.applySettingsUpdate({
                'inline-metadata-position': {
                  $set: value,
                },
              });
            } else {
              this.applySettingsUpdate({
                $unset: ['inline-metadata-position'],
              });
            }
          });
        }).addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('inline-metadata-position', local);
              input.setValue((globalValue as string) || defaultMetadataPosition);

              this.applySettingsUpdate({
                $unset: ['inline-metadata-position'],
              });
            });
        });
      });

    new Setting(contentEl)
      .setName(t('Move task data to card footer'))
      .setDesc(
        t(
          "When toggled, task data (from the Tasks plugin) will be displayed in the card's footer instead of the card's body."
        )
      )
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('move-task-metadata', local);

            if (value !== undefined) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined) {
              toggle.setValue(globalValue as boolean);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'move-task-metadata': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('move-task-metadata', local);
                toggleComponent.setValue((globalValue as boolean) ?? true);

                this.applySettingsUpdate({
                  $unset: ['move-task-metadata'],
                });
              });
          });
      });

    contentEl.createEl('br');
    contentEl.createEl('h4', { text: t('Linked Page Metadata') });
    contentEl.createEl('p', {
      cls: c('metadata-setting-desc'),
      text: t(
        'Display metadata for the first note linked within a card. Specify which metadata keys to display below. An optional label can be provided, and labels can be hidden altogether.'
      ),
    });

    new Setting(contentEl).then((setting) => {
      setting.settingEl.addClass(c('draggable-setting-container'));

      const [value] = this.getSetting('metadata-keys', local);

      const keys: MetadataSetting[] = ((value as DataKey[]) || ([] as DataKey[])).map((k) => {
        return {
          ...MetadataSettingTemplate,
          id: generateInstanceId(),
          data: k,
          win: getParentWindow(contentEl),
        };
      });

      renderMetadataSettings(setting.settingEl, contentEl, keys, (keys: MetadataSetting[]) =>
        this.applySettingsUpdate({
          'metadata-keys': {
            $set: keys.map((k) => k.data),
          },
        })
      );

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanupMetadataSettings(setting.settingEl);
        }
      });
    });

    contentEl.createEl('h4', { text: t('Board Header Buttons') });

    new Setting(contentEl).setName(t('Add a list')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-add-list', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-add-list': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-add-list', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-add-list'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Archive completed cards')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-archive-all', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-archive-all': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-archive-all', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-archive-all'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Open as markdown')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-view-as-markdown', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-view-as-markdown': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-view-as-markdown', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-view-as-markdown'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Open board settings')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-board-settings', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-board-settings': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-board-settings', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-board-settings'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Search...')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-search', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-search': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-search', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-search'],
              });
            });
        });
    });

    new Setting(contentEl).setName(t('Board view')).then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('show-set-view', local);

          if (value !== undefined && value !== null) {
            toggle.setValue(value as boolean);
          } else if (globalValue !== undefined && globalValue !== null) {
            toggle.setValue(globalValue as boolean);
          } else {
            // default
            toggle.setValue(true);
          }

          toggle.onChange((newValue) => {
            this.applySettingsUpdate({
              'show-set-view': {
                $set: newValue,
              },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip(t('Reset to default'))
            .onClick(() => {
              const [, globalValue] = this.getSetting('show-set-view', local);
              toggleComponent.setValue(!!globalValue);

              this.applySettingsUpdate({
                $unset: ['show-set-view'],
              });
            });
        });
    });

    new Setting(contentEl)
      .setName(t('Hide timelog in cards'))
      .setDesc(t('When toggled, timelog entries will be hidden in card view but still visible in markdown view'))
      .then((setting) => {
        let toggleComponent: ToggleComponent;

        setting
          .addToggle((toggle) => {
            toggleComponent = toggle;

            const [value, globalValue] = this.getSetting('hide-timelog', local);

            if (value !== undefined && value !== null) {
              toggle.setValue(value as boolean);
            } else if (globalValue !== undefined && globalValue !== null) {
              toggle.setValue(globalValue as boolean);
            } else {
              // default
              toggle.setValue(false);
            }

            toggle.onChange((newValue) => {
              this.applySettingsUpdate({
                'hide-timelog': {
                  $set: newValue,
                },
              });
            });
          })
          .addExtraButton((b) => {
            b.setIcon('lucide-rotate-ccw')
              .setTooltip(t('Reset to default'))
              .onClick(() => {
                const [, globalValue] = this.getSetting('hide-timelog', local);
                toggleComponent.setValue(!!globalValue);

                this.applySettingsUpdate({
                  $unset: ['hide-timelog'],
                });
              });
          });
      });

    /* ================= Timer Settings ================= */
    contentEl.createEl('h3', { text: 'Timer Settings' });

    /* Durations */
    contentEl.createEl('h4', { text: 'Durations' });

    const makeDurationSetting = (
      key: keyof KanbanSettings,
      label: string,
      placeholder: string,
      defaultVal: number,
      desc?: string
    ) => {
      new Setting(contentEl)
        .setName(label)
        .setDesc(desc || '')
        .then((setting) => {
          let inputComponent: TextComponent;

          setting
            .addText((text) => {
              inputComponent = text;

              text.setPlaceholder(placeholder);

              const [value, globalValue] = this.getSetting(key, local);

              const current = (value ?? globalValue ?? defaultVal) as number;
              text.setValue(String(current));

              text.onChange((val) => {
                if (!numberRegEx.test(val)) {
                  text.inputEl.toggleClass('mod-invalid', true);
                  return;
                }

                text.inputEl.toggleClass('mod-invalid', false);

                this.applySettingsUpdate({
                  [key]: { $set: Number(val) },
                } as any);
              });
            })
            .addExtraButton((b) => {
              b.setIcon('lucide-rotate-ccw')
                .setTooltip('Reset to default')
                .onClick(() => {
                  const [, globalValue] = this.getSetting(key, local);
                  inputComponent.setValue(String(globalValue ?? defaultVal));

                  this.applySettingsUpdate({
                    $unset: [key as string],
                  } as any);
                });
            });
        });
    };

    makeDurationSetting('timer-pomodoro', 'Pomodoro (minutes)', '25', 25);
    makeDurationSetting('timer-short-break', 'Short break (minutes)', '5', 5);
    makeDurationSetting('timer-long-break', 'Long break (minutes)', '15', 15);
    makeDurationSetting(
      'timer-long-break-interval',
      'Long break interval',
      '4',
      4,
      'Number of completed pomodoros before taking a long break. For example, set to 4 means every 4th pomodoro will be followed by a long break.'
    );
    makeDurationSetting(
      'timer-auto-rounds',
      'Auto pomodoro rounds (0 = disabled)',
      '0',
      0,
      'After the break, the next Pomodoro will automatically start. Repeat until all the set rounds are completed.'
    );

    /* Interrupt reasons */
    contentEl.createEl('h4', { text: 'Interrupt Reasons' });

    new Setting(contentEl).then((setting) => {
      const [value, globalValue] = this.getSetting('timer-interrupts', local);

      // 检查是否有有效的用户设置，如果没有则使用默认值
      const userReasons = (value || globalValue) as string[];
      const reasons: string[] = userReasons && userReasons.length > 0 
        ? userReasons 
        : DEFAULT_INTERRUPT_REASONS;

      renderInterruptReasonSettings(setting.settingEl, contentEl, reasons, (items: string[]) => {
        this.applySettingsUpdate({
          'timer-interrupts': { $set: items },
        });
      });

      this.cleanupFns.push(() => {
        if (setting.settingEl) {
          cleanUpInterruptReasonSettings(setting.settingEl);
        }
      });
    });

    /* Sounds */
    contentEl.createEl('h4', { text: 'Sounds' });

    new Setting(contentEl).setName('Enable sounds').then((setting) => {
      let toggleComponent: ToggleComponent;

      setting
        .addToggle((toggle) => {
          toggleComponent = toggle;

          const [value, globalValue] = this.getSetting('timer-enable-sounds', local);
          toggle.setValue((value ?? globalValue ?? false) as boolean);

          toggle.onChange((val) => {
            this.applySettingsUpdate({
              'timer-enable-sounds': { $set: val },
            });
          });
        })
        .addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip('Reset to default')
            .onClick(() => {
              const [, globalValue] = this.getSetting('timer-enable-sounds', local);
              toggleComponent.setValue((globalValue as boolean) ?? false);

              this.applySettingsUpdate({
                $unset: ['timer-enable-sounds'],
              });
            });
        });
    });


    new Setting(contentEl)
      .setName('Sound volume')
      .setDesc('Volume for end-of-session sound (0-100).')
      .then((setting) => {
        const container = setting.settingEl.createDiv({ cls: 'kanban-sound-volume' });
        const label = container.createSpan({ text: 'Volume:' });
        label.addClass('kanban-sound-volume-label');

        const input = container.createEl('input', { type: 'range' });
        input.min = '0';
        input.max = '100';
        input.step = '1';

        const [value, globalValue] = this.getSetting('timer-sound-volume', local);
        const initial = (typeof value === 'number' ? value : (typeof globalValue === 'number' ? globalValue : 100)) as number;
        input.value = String(initial);

        const valueText = container.createSpan({ text: ` ${initial}` });

        input.oninput = () => {
          const v = Number(input.value);
          valueText.setText(` ${v}`);
          if (!numberRegEx.test(String(v))) return;
          this.applySettingsUpdate({
            'timer-sound-volume': { $set: v },
          });
        };

        setting.addExtraButton((b) => {
          b.setIcon('lucide-rotate-ccw')
            .setTooltip('Reset to default')
            .onClick(() => {
              const [, globalValue2] = this.getSetting('timer-sound-volume', local);
              const resetTo = (typeof globalValue2 === 'number' ? globalValue2 : 100) as number;
              input.value = String(resetTo);
              valueText.setText(` ${resetTo}`);
              this.applySettingsUpdate({
                $unset: ['timer-sound-volume'],
              });
            });
        });
      });
  }

  cleanUp() {
    this.win = null;
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
  }
}

export class SettingsModal extends Modal {
  view: KanbanView;
  settingsManager: SettingsManager;

  constructor(view: KanbanView, config: SettingsManagerConfig, settings: KanbanSettings) {
    super(view.app);

    this.view = view;
    this.settingsManager = new SettingsManager(view.plugin, config, settings);
  }

  onOpen() {
    const { contentEl, modalEl } = this;

    modalEl.addClass(c('board-settings-modal'));

    this.settingsManager.constructUI(contentEl, this.view.file.basename, true);
  }

  onClose() {
    const { contentEl } = this;

    this.settingsManager.cleanUp();
    contentEl.empty();
  }
}

export class KanbanSettingsTab extends PluginSettingTab {
  plugin: KanbanPlugin;
  settingsManager: SettingsManager;

  constructor(plugin: KanbanPlugin, config: SettingsManagerConfig) {
    super(plugin.app, plugin);
    this.plugin = plugin;
    this.settingsManager = new SettingsManager(plugin, config, plugin.settings);
  }

  display() {
    const { containerEl } = this;

    containerEl.empty();
    containerEl.addClass(c('board-settings-modal'));

    this.settingsManager.constructUI(containerEl, t('Pomodoro Kanban Plugin'), false);
  }
}
