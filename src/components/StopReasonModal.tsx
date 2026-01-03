import { Fragment } from 'preact';
import { App, Modal, Setting } from 'obsidian';
import { render } from 'preact';
import { DEFAULT_INTERRUPT_REASONS } from '../Settings';
import { t } from '../lang/helpers';
import KanbanPlugin from '../main';
import { StateManager } from '../StateManager';

interface StopReasonProps {
  reasons: string[];
  onSelect: (reason: string) => void;
  onAddReason: () => void;
  onClose: () => void;
  onCancel: () => void;
}

function StopReasonPanel({ reasons, onSelect, onAddReason, onClose }: StopReasonProps) {
  return (
    <Fragment>
      <div className="kanban-plugin__stop-reason-panel">
        <h2 style={{ marginTop: 0 }}>{t('Why did you stop?')}</h2>
        <div className="kanban-plugin__stop-reason-list">
          {reasons.map((reason) => (
            <button
              key={reason}
              onClick={() => {
                onSelect(reason);
                onClose();
              }}
              className="kanban-plugin__stop-reason-item"
            >
              {reason}
            </button>
          ))}
          <button
            onClick={() => {
              onAddReason();
            }}
            className="kanban-plugin__stop-reason-item kanban-plugin__stop-reason-add"
          >
            {t('Add new reason...')}
          </button>
        </div>
      </div>
    </Fragment>
  );
}

/** A simple modal with a text input to capture a new interrupt reason. */
class NewReasonPrompt extends Modal {
  private resolve: (value: string | null) => void;
  private inputEl: HTMLInputElement;

  constructor(app: App, resolve: (value: string | null) => void) {
    super(app);
    this.resolve = resolve;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: t('Add new interrupt reason') });

    new Setting(contentEl)
      .setName(t('Reason'))
      .addText((text) => {
        this.inputEl = text.inputEl;
        text.inputEl.focus();
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText(t('Cancel'))
          .setCta()
          .onClick(() => {
            this.close();
            this.resolve(null);
          })
      )
      .addButton((btn) =>
        btn
          .setButtonText(t('Save'))
          .setCta()
          .onClick(() => {
            const val = this.inputEl.value.trim();
            if (val) {
              this.close();
              this.resolve(val);
            }
          })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

export class StopReasonModal extends Modal {
  onSelect: (reason: string) => void;
  onCancel: () => void;
  private plugin: KanbanPlugin;
  private stateManager?: StateManager; // 添加stateManager参数
  /** Flag to indicate whether a reason was selected before closing */
  private _reasonSelected: boolean = false;

  // 本地 reasons 列表
  private _reasons: string[] = [];

  constructor(plugin: KanbanPlugin, onSelect: (reason: string) => void, onCancel: () => void, stateManager?: StateManager) {
    super(plugin.app);
    this.plugin = plugin;
    this.stateManager = stateManager;
    this.onSelect = onSelect;
    this.onCancel = onCancel;
    this._reasons = this.getReasons();
  }

  /** Get reasons from settings */
  private getReasons(): string[] {
    // 优先使用stateManager的getSetting方法，这样可以正确处理本地和全局设置的层级关系
    let userReasons: string[] = [];
    
    if (this.stateManager) {
      // 使用stateManager的getSetting方法，它会正确处理本地设置覆盖全局设置的情况
      userReasons = (this.stateManager.getSetting('timer-interrupts') as string[]) || [];
    } else {
      // 如果没有stateManager，回退到直接访问全局设置
      userReasons = (this.plugin.settings?.['timer-interrupts'] as string[]) || [];
    }
    
    // 确保至少有默认值 - 检查数组是否为空
    if (!userReasons || userReasons.length === 0) {
      userReasons = [...DEFAULT_INTERRUPT_REASONS];
    }
    
    return userReasons;
  }

  /** Prompt user for a new reason, save to settings, and return it */
  private async promptForReason(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      const modal = new NewReasonPrompt(this.plugin.app, (val) => {
        void (async () => {
          if (val) {
            let list: string[] = [];
            
            if (this.stateManager) {
              // 使用stateManager的getSetting方法获取当前设置
              list = (this.stateManager.getSetting('timer-interrupts') as string[]) || [];
            } else {
              // 回退到全局设置
              list = (this.plugin.settings['timer-interrupts'] as string[]) || [];
            }
            
            // 如果列表为空，使用默认值
            if (!list || list.length === 0) {
              list = [...DEFAULT_INTERRUPT_REASONS];
            }
            
            if (!list.includes(val)) {
              list.push(val);
              
              if (this.stateManager) {
                // 如果有stateManager，更新本地设置
                const currentSettings = this.stateManager.state.data.settings || {};
                const updatedSettings = {
                  ...currentSettings,
                  'timer-interrupts': list
                };
                
                // 更新stateManager的设置
                this.stateManager.setState({
                  ...this.stateManager.state,
                  data: {
                    ...this.stateManager.state.data,
                    settings: updatedSettings
                  }
                });
              } else {
                // 否则更新全局设置
                this.plugin.settings['timer-interrupts'] = list;
                await this.plugin.saveSettings?.();
              }
            }
          }
          resolve(val);
        })();
      });
      modal.open();
    });
  }

  onOpen() {
    const rerender = () => {
      render(
        <StopReasonPanel
          reasons={this._reasons}
          onSelect={(reason: string) => {
            this._reasonSelected = true;
            this.onSelect(reason);
            this.close();
          }}
          onAddReason={() => {
            void (async () => {
              const newReason = await this.promptForReason();
              if (newReason) {
                // 刷新本地 reasons 并重渲染
                this._reasons = this.getReasons();
                rerender();
              }
            })();
          }}
          onClose={() => this.close()}
          onCancel={this.onCancel}
        />,
        this.contentEl
      );
    };

    rerender();
  }

  onClose() {
    // Only resume timer if user closed modal without selecting a reason.
    if (!this._reasonSelected) {
      this.onCancel();
    }
    render(null, this.contentEl);
  }
}