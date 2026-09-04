import * as vscode from 'vscode';
import { COMMANDS, CONFIG_KEYS, CONFIG_SECTION, DEFAULTS } from './constants';
import { DebugManager } from './debugManager';
import { TaskManager } from './taskManager';

/**
 * Manages the three VS Code status bar items representing the IntelliJ-style Run Configuration widget:
 * 1. Task Selector item: displays $(checklist) <Task Name> ▾ and opens task selection QuickPick.
 * 2. Play / Stop toggle item: dynamically toggles between $(play) and $(debug-stop).
 * 3. Debug item: displays $(debug-alt) to initiate debugging for the active task.
 */
export class StatusBarController implements vscode.Disposable {
  private taskSelectorItem: vscode.StatusBarItem;
  private playStopItem: vscode.StatusBarItem;
  private debugItem: vscode.StatusBarItem;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly taskManager: TaskManager,
    private readonly debugManager?: DebugManager
  ) {
    const priority = this.getBasePriority();

    this.taskSelectorItem = vscode.window.createStatusBarItem(
      'tasksWidget.taskSelector',
      vscode.StatusBarAlignment.Left,
      priority
    );
    this.taskSelectorItem.name = 'Tasks Widget: Task Selector';

    this.playStopItem = vscode.window.createStatusBarItem(
      'tasksWidget.playStop',
      vscode.StatusBarAlignment.Left,
      priority - 1
    );
    this.playStopItem.name = 'Tasks Widget: Run / Stop Task';

    this.debugItem = vscode.window.createStatusBarItem(
      'tasksWidget.debug',
      vscode.StatusBarAlignment.Left,
      priority - 2
    );
    this.debugItem.name = 'Tasks Widget: Debug Task';

    this.disposables.push(this.taskSelectorItem, this.playStopItem, this.debugItem);

    this.registerEventListeners();
    this.update();
  }

  /**
   * Retrieves base priority from workspace configuration or default.
   */
  private getBasePriority(): number {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return config.get<number>(CONFIG_KEYS.STATUS_BAR_PRIORITY, DEFAULTS.STATUS_BAR_PRIORITY);
  }

  /**
   * Checks whether the debug button is enabled in workspace configuration.
   */
  private isDebugButtonEnabled(): boolean {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return config.get<boolean>(CONFIG_KEYS.SHOW_DEBUG_BUTTON, true);
  }

  /**
   * Returns the Task Selector status bar item.
   */
  public getTaskSelectorItem(): vscode.StatusBarItem {
    return this.taskSelectorItem;
  }

  /**
   * Returns the Play / Stop toggle status bar item.
   */
  public getPlayStopItem(): vscode.StatusBarItem {
    return this.playStopItem;
  }

  /**
   * Returns the Debug status bar item.
   */
  public getDebugItem(): vscode.StatusBarItem {
    return this.debugItem;
  }

  /**
   * Refreshes all status bar items based on active task and execution states.
   */
  public update(): void {
    this.updateTaskSelector();
    this.updatePlayStop();
    this.updateDebug();
  }

  /**
   * Updates the Task Selector status bar item with the active task name or fallback.
   */
  private updateTaskSelector(): void {
    const activeTask = this.taskManager.getActiveTask();
    const activeLabel = activeTask?.name ?? this.taskManager.getActiveTaskLabel();

    if (activeLabel) {
      this.taskSelectorItem.text = `$(checklist) ${activeLabel} \u25BE`;
      this.taskSelectorItem.tooltip = `Current Task: ${activeLabel}\nClick to switch task`;
    } else {
      this.taskSelectorItem.text = `$(checklist) Select Task \u25BE`;
      this.taskSelectorItem.tooltip = 'Click to select a workspace task';
    }

    this.taskSelectorItem.command = COMMANDS.SELECT_TASK;
    this.taskSelectorItem.show();
  }

  /**
   * Updates the Play / Stop toggle status bar item depending on whether the selected task is running.
   */
  private updatePlayStop(): void {
    const activeTask = this.taskManager.getActiveTask();
    const activeLabel = activeTask?.name ?? this.taskManager.getActiveTaskLabel();
    const isRunning = this.taskManager.isSelectedTaskRunning();

    if (isRunning) {
      this.playStopItem.text = '$(debug-stop)';
      this.playStopItem.command = COMMANDS.STOP_SELECTED_TASK;
      this.playStopItem.tooltip = activeLabel
        ? `Stop '${activeLabel}'`
        : 'Stop Running Task';
    } else {
      this.playStopItem.text = '$(play)';
      this.playStopItem.command = COMMANDS.RUN_SELECTED_TASK;
      this.playStopItem.tooltip = activeLabel
        ? `Run '${activeLabel}'`
        : 'Run Selected Task';
    }

    this.playStopItem.show();
  }

  /**
   * Updates the Debug status bar item visibility and tooltip.
   */
  private updateDebug(): void {
    if (!this.isDebugButtonEnabled()) {
      this.debugItem.hide();
      return;
    }

    const activeTask = this.taskManager.getActiveTask();
    const activeLabel = activeTask?.name ?? this.taskManager.getActiveTaskLabel();

    this.debugItem.text = '$(debug-alt)';
    this.debugItem.command = COMMANDS.DEBUG_SELECTED_TASK;
    this.debugItem.tooltip = activeLabel
      ? `Debug '${activeLabel}'`
      : 'Debug Selected Task';
    this.debugItem.show();
  }

  /**
   * Registers event listeners for task changes, execution lifecycle, and config changes.
   */
  private registerEventListeners(): void {
    // 1. Task selection changes
    this.disposables.push(
      this.taskManager.onDidChangeActiveTask(() => {
        this.update();
      })
    );

    // 2. Task running state changes from TaskManager
    this.disposables.push(
      this.taskManager.onDidChangeRunningState(() => {
        this.updatePlayStop();
      })
    );

    // 3. Process lifecycle events from vscode.tasks to dynamically toggle Play / Stop
    this.disposables.push(
      vscode.tasks.onDidStartTaskProcess(() => {
        this.updatePlayStop();
      }),
      vscode.tasks.onDidEndTaskProcess(() => {
        this.updatePlayStop();
      }),
      vscode.tasks.onDidStartTask(() => {
        this.updatePlayStop();
      }),
      vscode.tasks.onDidEndTask(() => {
        this.updatePlayStop();
      })
    );

    // 4. Debug session lifecycle events if DebugManager is provided
    if (this.debugManager) {
      this.disposables.push(
        this.debugManager.onDidChangeActiveDebugSession(() => {
          this.update();
        })
      );
    }

    // 5. Configuration changes (e.g., toggling showDebugButton or priority)
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_SECTION)) {
          this.update();
        }
      })
    );
  }

  /**
   * Disposes status bar items and registered event listeners.
   */
  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
