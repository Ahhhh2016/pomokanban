import { around } from 'monkey-around';
import {
  MarkdownView,
  Platform,
  Plugin,
  App,
  TFile,
  TFolder,
  ViewState,
  WorkspaceLeaf,
  debounce,
  addIcon,
} from 'obsidian';
import { render, unmountComponentAtNode, useEffect, useState } from 'preact/compat';

import { createApp } from './DragDropApp';
import { KanbanView, kanbanIcon, kanbanViewType } from './KanbanView';
import { KanbanSettings, KanbanSettingsTab, DEFAULT_INTERRUPT_REASONS } from './Settings';
import { StateManager } from './StateManager';
import { DateSuggest, TimeSuggest } from './components/Editor/suggest';
import { getParentWindow } from './dnd/util/getWindow';
import { hasFrontmatterKey } from './helpers';
import { t } from './lang/helpers';
import { basicFrontmatter, frontmatterKey } from './parsers/common';
import { TimerManager } from './TimerManager';

// Obsidian provides a global `app` variable; declare it for type checking
declare const app: App;

interface WindowRegistry {
  viewMap: Map<string, KanbanView>;
  viewStateReceivers: Array<(views: KanbanView[]) => void>;
  appRoot: HTMLElement;
}

function getEditorClass(app: App) {
  const md = (window as unknown as {
    app: {
      embedRegistry: {
        embedByExtension: {
          md: (args: { app: App; containerEl: HTMLElement; state: unknown }, a: unknown, b: string) => any;
        };
      };
    };
  }).app.embedRegistry.embedByExtension.md(
    { app: app, containerEl: createDiv(), state: {} },
    null,
    ''
  );

  md.load();
  md.editable = true;
  md.showEditor();

  const MarkdownEditor = Object.getPrototypeOf(Object.getPrototypeOf(md.editMode)).constructor;

  md.unload();

  return MarkdownEditor;
}

export default class KanbanPlugin extends Plugin {
  settingsTab: KanbanSettingsTab;
  settings: KanbanSettings = {};

  // leafid => view mode
  kanbanFileModes: Record<string, string> = {};
  stateManagers: Map<TFile, StateManager> = new Map();
  timerManager: TimerManager;

  windowRegistry: Map<Window, WindowRegistry> = new Map();

  _loaded: boolean = false;

  isShiftPressed: boolean = false;

  async loadSettings() {
    this.settings = Object.assign({}, await this.loadData());
    
    // Ensure default interrupt reasons are set if not already present or empty
    if (!this.settings['timer-interrupts'] || this.settings['timer-interrupts'].length === 0) {
      this.settings['timer-interrupts'] = [...DEFAULT_INTERRUPT_REASONS];
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  unload(): void {
    super.unload();
    void Promise.all(
      this.app.workspace.getLeavesOfType(kanbanViewType).map((leaf) => {
        this.kanbanFileModes[(leaf as any).id] = 'markdown';
        return this.setMarkdownView(leaf);
      })
    );
  }

  onunload() {
    this.MarkdownEditor = null;
    this.windowRegistry.forEach((reg, win) => {
      reg.viewStateReceivers.forEach((fn) => fn([]));
      this.unmount(win);
    });

    this.unmount(window);

    this.stateManagers.clear();
    this.windowRegistry.clear();
    this.kanbanFileModes = {};

    (this.app.workspace as unknown as { unregisterHoverLinkSource?: (id: string) => void }).unregisterHoverLinkSource?.(
      frontmatterKey
    );
  }

  MarkdownEditor: unknown;

  async onload() {
    await this.loadSettings();

    // Register custom pomodoro tomato icon
    addIcon('pomodoro-tomato', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor"><path d="M480-675q-18-13-38.5-19t-41.5-6q-27 0-53 10.5T301-659q-20 20-30.5 46T260-560q0 21 6 41.5t19 38.5q-13 18-19 38.5t-6 41.5q0 27 10.5 53t30.5 46q20 20 46 30.5t53 10.5q21 0 41.5-6t38.5-19q18 13 38.5 19t41.5 6q27 0 53-10.5t46-30.5q20-20 30.5-46t10.5-53q0-21-6-41.5T675-480q13-18 19-38.5t6-41.5q0-27-10.5-53T659-659q-20-20-46-30.5T560-700q-21 0-41.5 6T480-675Zm0 292-46 32q-8 5-16.5 8t-17.5 3q-11 0-22-4.5T358-358q-9-9-13.5-20t-4.5-22q0-9 3-17.5t8-16.5l32-46-32-46q-5-8-8-16.5t-3-17.5q0-11 4.5-22t13.5-20q9-9 20-13.5t22-4.5q9 0 17.5 3t16.5 8l46 32 46-32q8-5 16.5-8t17.5-3q11 0 22 4.5t20 13.5q9 9 13.5 20t4.5 22q0 9-3 17.5t-8 16.5l-32 46 32 46q5 8 8 16.5t3 17.5q0 11-4.5 22T602-358q-9 9-20 13.5t-22 4.5q-9 0-17.5-3t-16.5-8l-46-32Zm0-47q21 0 35.5-14.5T530-480q0-21-14.5-35.5T480-530q-21 0-35.5 14.5T430-480q0 21 14.5 35.5T480-430Zm0 350q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>');

    // Initialize global timer manager before any views mount
    this.timerManager = new TimerManager(this);

    this.MarkdownEditor = getEditorClass(this.app);

    this.registerEditorSuggest(new TimeSuggest(this.app, this));
    this.registerEditorSuggest(new DateSuggest(this.app, this));

    this.registerEvent(
      this.app.workspace.on('window-open', (_evt: unknown, win: Window) => {
        this.mount(win);
      })
    );

    this.registerEvent(
      this.app.workspace.on('window-close', (_evt: unknown, win: Window) => {
        this.unmount(win);
      })
    );

    this.settingsTab = new KanbanSettingsTab(this, {
      onSettingsChange: async (newSettings) => {
        this.settings = newSettings;
        await this.saveSettings();

        // Update timer durations based on new settings
        this.timerManager?.updateSettings();

        // Force a complete re-render when settings change
        this.stateManagers.forEach((stateManager) => {
          stateManager.forceRefresh();
        });
      },
    });

    this.addSettingTab(this.settingsTab);

    this.registerView(kanbanViewType, (leaf) => new KanbanView(leaf, this));
    this.registerMonkeyPatches();
    this.registerCommands();
    this.registerEvents();

    // Mount an empty component to start; views will be added as we go
    this.mount(window);

    ((this.app.workspace as unknown as { floatingSplit?: { children?: Array<{ win: Window }> } }).floatingSplit
      ?.children || []
    ).forEach((c) => {
      if (c?.win) this.mount(c.win);
    });

    this.registerDomEvent(window, 'keydown', this.handleShift);
    this.registerDomEvent(window, 'keyup', this.handleShift);

    this.addRibbonIcon(kanbanIcon, t('Create new board'), () => {
      this.newKanban();
    });
  }

  handleShift = (e: KeyboardEvent) => {
    this.isShiftPressed = e.shiftKey;
  };

  getKanbanViews(win: Window) {
    const reg = this.windowRegistry.get(win);

    if (reg) {
      return Array.from(reg.viewMap.values());
    }

    return [];
  }

  getKanbanView(id: string, win: Window) {
    const reg = this.windowRegistry.get(win);

    if (reg?.viewMap.has(id)) {
      return reg.viewMap.get(id);
    }

    for (const reg of this.windowRegistry.values()) {
      if (reg.viewMap.has(id)) {
        return reg.viewMap.get(id);
      }
    }

    return null;
  }

  getStateManager(file: TFile) {
    return this.stateManagers.get(file);
  }

  getStateManagerFromViewID(id: string, win: Window) {
    const view = this.getKanbanView(id, win);

    if (!view) {
      return null;
    }

    return this.stateManagers.get(view.file);
  }

  useKanbanViews(win: Window): KanbanView[] {
    const [state, setState] = useState(this.getKanbanViews(win));

    useEffect(() => {
      const reg = this.windowRegistry.get(win);

      reg?.viewStateReceivers.push(setState);

      return () => {
        reg?.viewStateReceivers.remove(setState);
      };
    }, [win]);

    return state;
  }

  addView(view: KanbanView, data: string, shouldParseData: boolean) {
    const win = view.getWindow();
    const reg = this.windowRegistry.get(win);

    if (!reg) return;
    if (!reg.viewMap.has(view.id)) {
      reg.viewMap.set(view.id, view);
    }

    const file = view.file;

    if (this.stateManagers.has(file)) {
      this.stateManagers.get(file).registerView(view, data, shouldParseData);
    } else {
      this.stateManagers.set(
        file,
        new StateManager(
          this.app,
          view,
          data,
          () => this.stateManagers.delete(file),
          () => this.settings
        )
      );
    }

    reg.viewStateReceivers.forEach((fn) => fn(this.getKanbanViews(win)));
  }

  removeView(view: KanbanView) {
    const entry = Array.from(this.windowRegistry.entries()).find(([, reg]) => {
      return reg.viewMap.has(view.id);
    }, []);

    if (!entry) return;

    const [win, reg] = entry;
    const file = view.file;

    if (reg.viewMap.has(view.id)) {
      reg.viewMap.delete(view.id);
    }

    if (this.stateManagers.has(file)) {
      this.stateManagers.get(file).unregisterView(view);
      reg.viewStateReceivers.forEach((fn) => fn(this.getKanbanViews(win)));
    }
  }

  handleViewFileRename(view: KanbanView, oldPath: string) {
    const win = view.getWindow();
    if (!this.windowRegistry.has(win)) {
      return;
    }

    const reg = this.windowRegistry.get(win);
    const leafId = (view.leaf as unknown as { id?: string })?.id ?? '';
    const oldId = `${leafId}:::${oldPath}`;

    if (reg.viewMap.has(oldId)) {
      reg.viewMap.delete(oldId);
    }

    if (!reg.viewMap.has(view.id)) {
      reg.viewMap.set(view.id, view);
    }

    if (view.isPrimary) {
      this.getStateManager(view.file).softRefresh();
    }
  }

  mount(win: Window) {
    if (this.windowRegistry.has(win)) {
      return;
    }

    const el = win.document.body.createDiv();

    this.windowRegistry.set(win, {
      viewMap: new Map(),
      viewStateReceivers: [],
      appRoot: el,
    });

    render(createApp(win, this), el);
  }

  unmount(win: Window) {
    if (!this.windowRegistry.has(win)) {
      return;
    }

    const reg = this.windowRegistry.get(win);

    for (const view of reg.viewMap.values()) {
      this.removeView(view);
    }

    unmountComponentAtNode(reg.appRoot);

    reg.appRoot.remove();
    reg.viewMap.clear();
    reg.viewStateReceivers.length = 0;
    reg.appRoot = null;

    this.windowRegistry.delete(win);
  }

  async setMarkdownView(leaf: WorkspaceLeaf, focus: boolean = true) {
    await leaf.setViewState(
      {
        type: 'markdown',
        state: leaf.view.getState(),
        popstate: true,
      } as ViewState,
      { focus }
    );
  }

  async setKanbanView(leaf: WorkspaceLeaf) {
    await leaf.setViewState({
      type: kanbanViewType,
      state: leaf.view.getState(),
      popstate: true,
    } as ViewState);
  }

  async newKanban(folder?: TFolder) {
    const targetFolder = folder
      ? folder
      : this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path || '');

    try {
      const kanban: TFile = await this.app.fileManager.createNewMarkdownFile(
        targetFolder,
        t('Untitled Kanban')
      );

      await this.app.vault.modify(kanban, basicFrontmatter);
      await this.app.workspace.getLeaf().setViewState({
        type: kanbanViewType,
        state: { file: kanban.path },
      });
    } catch (e) {
      console.error('Error creating kanban board:', e);
    }
  }

  registerEvents() {
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file, source, leaf) => {
        if (source === 'link-context-menu') return;

        const fileIsFile = file instanceof TFile;
        const fileIsFolder = file instanceof TFolder;
        const leafIsMarkdown = leaf?.view instanceof MarkdownView;
        const leafIsKanban = leaf?.view instanceof KanbanView;

        // Add menu items to the folder context menu to create boards
        if (fileIsFolder) {
          menu.addItem((item) => {
            item
              .setSection('action-primary')
              .setTitle(t('New pomodoro kanban board'))
              .setIcon('pomodoro-tomato')
              .onClick(() => this.newKanban(file));
          });
          return;
        }

        if (
          !Platform.isMobile &&
          fileIsFile &&
          leaf &&
          source === 'sidebar-context-menu' &&
          hasFrontmatterKey(file)
        ) {
          const views = this.getKanbanViews(getParentWindow(leaf.view.containerEl));
          let haveKanbanView = false;

          for (const view of views) {
            if (view.file === file) {
              view.onPaneMenu(menu, 'more-options', false);
              haveKanbanView = true;
              break;
            }
          }

          if (!haveKanbanView) {
            menu.addItem((item) => {
              item
                .setTitle(t('Open as kanban board'))
                .setIcon(kanbanIcon)
                .setSection('pane')
                .onClick(() => {
                  const leafId = (leaf as unknown as { id?: string })?.id;
                  this.kanbanFileModes[leafId || file.path] = kanbanViewType;
                  this.setKanbanView(leaf);
                });
            });

            return;
          }
        }

        if (
          leafIsMarkdown &&
          fileIsFile &&
          ['more-options', 'pane-more-options', 'tab-header'].includes(source) &&
          hasFrontmatterKey(file)
        ) {
          menu.addItem((item) => {
            item
              .setTitle(t('Open as kanban board'))
              .setIcon(kanbanIcon)
              .setSection('pane')
              .onClick(() => {
                const leafId2 = (leaf as unknown as { id?: string })?.id;
                this.kanbanFileModes[leafId2 || file.path] = kanbanViewType;
                this.setKanbanView(leaf);
              });
          });
        }

        if (fileIsFile && leafIsKanban) {
          if (['pane-more-options', 'tab-header'].includes(source)) {
            menu.addItem((item) => {
              item
                .setTitle(t('Open as markdown'))
                .setIcon(kanbanIcon)
                .setSection('pane')
                .onClick(() => {
                  const lid = (leaf as unknown as { id?: string })?.id;
                  this.kanbanFileModes[lid || file.path] = 'markdown';
                  this.setMarkdownView(leaf);
                });
            });
          }

          if (Platform.isMobile) {
            const stateManager = this.stateManagers.get(file);
            const kanbanView = leaf.view as KanbanView;
            const boardView =
              kanbanView.viewSettings[frontmatterKey] || stateManager.getSetting(frontmatterKey);

            menu
              .addItem((item) => {
                item
                  .setTitle(t('Add a list'))
                  .setIcon('lucide-plus-circle')
                  .setSection('pane')
                  .onClick(() => {
                    kanbanView.emitter.emit('showLaneForm', undefined);
                  });
              })
              .addItem((item) => {
                item
                  .setTitle(t('Archive completed cards'))
                  .setIcon('lucide-archive')
                  .setSection('pane')
                  .onClick(() => {
                    stateManager.archiveCompletedCards();
                  });
              })
              .addItem((item) => {
                item
                  .setTitle(t('Archive completed cards'))
                  .setIcon('lucide-archive')
                  .setSection('pane')
                  .onClick(() => {
                    const stateManager = this.stateManagers.get(file);
                    stateManager.archiveCompletedCards();
                  });
              })
              .addItem((item) =>
                item
                  .setTitle(t('View as board'))
                  .setSection('pane')
                  .setIcon('lucide-trello')
                  .setChecked(boardView === 'basic' || boardView === 'board')
                  .onClick(() => kanbanView.setView('board'))
              )
              .addItem((item) =>
                item
                  .setTitle(t('View as table'))
                  .setSection('pane')
                  .setIcon('lucide-table')
                  .setChecked(boardView === 'table')
                  .onClick(() => kanbanView.setView('table'))
              )
              .addItem((item) =>
                item
                  .setTitle(t('View as list'))
                  .setSection('pane')
                  .setIcon('lucide-server')
                  .setChecked(boardView === 'list')
                  .onClick(() => kanbanView.setView('list'))
              )
              .addItem((item) =>
                item
                  .setTitle(t('Open board settings'))
                  .setSection('pane')
                  .setIcon('lucide-settings')
                  .onClick(() => kanbanView.getBoardSettings())
              );
          }
        }
      })
    );

    this.registerEvent(
      app.vault.on('rename', (file: TFile, oldPath: string) => {
        const kanbanLeaves = app.workspace.getLeavesOfType(kanbanViewType);

        kanbanLeaves.forEach((leaf: WorkspaceLeaf) => {
          (leaf.view as KanbanView).handleRename(file.path, oldPath);
        });
      })
    );

    const notifyFileChange = debounce(
      (file: TFile) => {
        this.stateManagers.forEach((manager) => {
          if (manager.file !== file) {
            manager.onFileMetadataChange();
          }
        });
      },
      2000,
      true
    );

    this.registerEvent(
      app.vault.on('modify', (file: TFile) => {
        if (file instanceof TFile) {
          notifyFileChange(file);
        }
      })
    );

    this.registerEvent(
      app.metadataCache.on('changed', (file: TFile) => {
        notifyFileChange(file);
      })
    );

    this.registerEvent(
      (app.metadataCache as unknown as {
        on: (event: string, cb: (...args: unknown[]) => void) => unknown;
      }).on('dataview:metadata-change', (_evt: unknown, file: TFile) => {
        notifyFileChange(file);
      })
    );

    this.registerEvent(
      (app.metadataCache as unknown as {
        on: (event: string, cb: (...args: unknown[]) => void) => unknown;
      }).on('dataview:api-ready', () => {
        this.stateManagers.forEach((manager) => {
          manager.forceRefresh();
        });
      })
    );

    (app.workspace as unknown as {
      registerHoverLinkSource: (id: string, obj: { display: string; defaultMod: boolean }) => void;
    }).registerHoverLinkSource(frontmatterKey, {
      display: 'Kanban',
      defaultMod: true,
    });
  }

  registerCommands() {
    this.addCommand({
      id: 'create-new-kanban-board',
      name: t('Create new board'),
      callback: () => this.newKanban(),
    });

    this.addCommand({
      id: 'archive-completed-cards',
      name: t('Archive completed cards in active board'),
      checkCallback: (checking) => {
        const activeView = app.workspace.getActiveViewOfType(KanbanView);

        if (!activeView) return false;
        if (checking) return true;

        this.stateManagers.get(activeView.file).archiveCompletedCards();
      },
    });

    this.addCommand({
      id: 'toggle-kanban-view',
      name: t('Toggle between Kanban and markdown mode'),
      checkCallback: (checking) => {
        const activeFile = app.workspace.getActiveFile();

        if (!activeFile) return false;

        const fileCache = app.metadataCache.getFileCache(activeFile);
        const fileIsKanban = !!fileCache?.frontmatter && !!fileCache.frontmatter[frontmatterKey];

        if (checking) {
          return fileIsKanban;
        }

        const activeView = app.workspace.getActiveViewOfType(KanbanView);

        if (activeView) {
          const leafId = (activeView.leaf as unknown as { id?: string })?.id;
          this.kanbanFileModes[leafId || activeFile.path] = 'markdown';
          this.setMarkdownView(activeView.leaf);
        } else if (fileIsKanban) {
          const activeView = app.workspace.getActiveViewOfType(MarkdownView);

          if (activeView) {
            const leafId = (activeView.leaf as unknown as { id?: string })?.id;
            this.kanbanFileModes[leafId || activeFile.path] = kanbanViewType;
            this.setKanbanView(activeView.leaf);
          }
        }
      },
    });

    this.addCommand({
      id: 'convert-to-kanban',
      name: t('Convert empty note to Kanban'),
      checkCallback: (checking) => {
        const activeView = app.workspace.getActiveViewOfType(MarkdownView);

        if (!activeView) return false;

        const isFileEmpty = activeView.file.stat.size === 0;

        if (checking) return isFileEmpty;
        if (isFileEmpty) {
          app.vault
            .modify(activeView.file, basicFrontmatter)
            .then(() => {
              this.setKanbanView(activeView.leaf);
            })
            .catch((e: unknown) => console.error(e));
        }
      },
    });

    this.addCommand({
      id: 'add-kanban-lane',
      name: t('Add a list'),
      checkCallback: (checking) => {
        const view = app.workspace.getActiveViewOfType(KanbanView);

        if (checking) {
          return view && view instanceof KanbanView;
        }

        if (view && view instanceof KanbanView) {
          view.emitter.emit('showLaneForm', undefined);
        }
      },
    });

    this.addCommand({
      id: 'view-board',
      name: t('View as board'),
      checkCallback: (checking) => {
        const view = app.workspace.getActiveViewOfType(KanbanView);

        if (checking) {
          return view && view instanceof KanbanView;
        }

        if (view && view instanceof KanbanView) {
          view.setView('board');
        }
      },
    });

    this.addCommand({
      id: 'view-table',
      name: t('View as table'),
      checkCallback: (checking) => {
        const view = app.workspace.getActiveViewOfType(KanbanView);

        if (checking) {
          return view && view instanceof KanbanView;
        }

        if (view && view instanceof KanbanView) {
          view.setView('table');
        }
      },
    });

    this.addCommand({
      id: 'view-list',
      name: t('View as list'),
      checkCallback: (checking) => {
        const view = app.workspace.getActiveViewOfType(KanbanView);

        if (checking) {
          return view && view instanceof KanbanView;
        }

        if (view && view instanceof KanbanView) {
          view.setView('list');
        }
      },
    });

    this.addCommand({
      id: 'open-board-settings',
      name: t('Open board settings'),
      checkCallback: (checking) => {
        const view = app.workspace.getActiveViewOfType(KanbanView);

        if (!view) return false;
        if (checking) return true;

        view.getBoardSettings();
      },
    });
  }

  registerMonkeyPatches() {
    const self = this;

    this.app.workspace.onLayoutReady(() => {
      this.register(
        around((app.commands as unknown as Record<string, unknown>), {
          executeCommand(next) {
            return function (command: { id?: string }) {
              const view = app.workspace.getActiveViewOfType(KanbanView);

              if (view && command?.id) {
                view.emitter.emit('hotkey', { commandId: command.id });
              }

              return next.call(this, command);
            };
          },
        })
      );
    });

    this.register(
      this.app.workspace.on('active-leaf-change', () => {
        const view = this.app.workspace.getActiveViewOfType(KanbanView);
        if (view?.activeEditor) {
          (this.app.workspace as unknown as { activeEditor?: unknown }).activeEditor = view.activeEditor;
        }
      })
    );

    // Monkey patch WorkspaceLeaf to open Kanbans with KanbanView by default
    this.register(
      around(WorkspaceLeaf.prototype, {
        // Kanbans can be viewed as markdown or kanban, and we keep track of the mode
        // while the file is open. When the file closes, we no longer need to keep track of it.
        detach(next) {
          return function () {
            const state = this.view?.getState();

            if (state?.file && self.kanbanFileModes[this.id || state.file]) {
              delete self.kanbanFileModes[this.id || state.file];
            }

            return next.apply(this);
          };
        },

        setViewState(next) {
          return function (state: ViewState, ...rest: unknown[]) {
            if (
              // Don't force kanban mode during shutdown
              self._loaded &&
              // If we have a markdown file
              state.type === 'markdown' &&
              state.state?.file &&
              // And the current mode of the file is not set to markdown
              self.kanbanFileModes[this.id || state.state.file] !== 'markdown'
            ) {
              // Then check for the kanban frontMatterKey
              const cache = self.app.metadataCache.getCache(state.state.file as string);

              if (cache?.frontmatter && cache.frontmatter[frontmatterKey]) {
                // If we have it, force the view type to kanban
                const newState = {
                  ...state,
                  type: kanbanViewType,
                };

                self.kanbanFileModes[state.state.file as string] = kanbanViewType;

                return next.apply(this, [newState, ...(rest as [])]);
              }
            }

            return next.apply(this, [state, ...(rest as [])]);
          };
        },
      })
    );
  }
}
