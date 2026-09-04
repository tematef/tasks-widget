import * as vscode from 'vscode';
import { TaskConfigDefinition, TaskConfigManager } from './taskConfigManager';
import { TaskManager } from './taskManager';

export interface TaskQuickPickItem extends vscode.QuickPickItem {
  task?: vscode.Task;
  action?: 'add' | 'configure';
}

/**
 * Controller for the Task Selector QuickPick dropdown menu and guided task creation/editing flows.
 */
export class QuickPickController implements vscode.Disposable {
  private readonly taskConfigManager: TaskConfigManager;
  private disposables: vscode.Disposable[] = [];
  private activeQuickPick?: vscode.QuickPick<TaskQuickPickItem>;

  constructor(
    private readonly taskManager: TaskManager,
    taskConfigManager?: TaskConfigManager
  ) {
    this.taskConfigManager = taskConfigManager ?? new TaskConfigManager();
  }

  /**
   * Builds categorized QuickPick items from available tasks.
   */
  public buildQuickPickItems(tasks: vscode.Task[]): TaskQuickPickItem[] {
    const items: TaskQuickPickItem[] = [];
    const activeLabel = this.taskManager.getActiveTaskLabel();

    const workspaceTasks: vscode.Task[] = [];
    const detectedTasks: vscode.Task[] = [];

    for (const task of tasks) {
      const source = (task.source || '').toLowerCase();
      if (source && source !== 'workspace') {
        detectedTasks.push(task);
      } else {
        workspaceTasks.push(task);
      }
    }

    const mapTaskToItem = (task: vscode.Task): TaskQuickPickItem => {
      const isActive = task.name === activeLabel;
      const isRunning = this.taskManager.isTaskRunning(task);

      const statusParts: string[] = [];
      if (isRunning) {
        statusParts.push('$(sync~spin) Running');
      }
      if (isActive) {
        statusParts.push('Active');
      }
      if (task.source && task.source.toLowerCase() !== 'workspace') {
        statusParts.push(task.source);
      }

      const description = statusParts.length > 0 ? statusParts.join(' • ') : undefined;

      let detail: string | undefined;
      const execution = task.execution as { command?: string; commandLine?: string; process?: string } | undefined;
      if (execution?.commandLine) {
        detail = execution.commandLine;
      } else if (execution?.command) {
        detail = execution.command;
      } else if (execution?.process) {
        detail = execution.process;
      } else if (typeof task.definition?.command === 'string') {
        detail = task.definition.command;
      }

      return {
        label: isActive ? `$(check) ${task.name}` : `  ${task.name}`,
        description,
        detail,
        task,
        picked: isActive,
        buttons: [
          {
            iconPath: new vscode.ThemeIcon('edit'),
            tooltip: 'Edit task in tasks.json',
          },
        ],
      };
    };

    if (workspaceTasks.length > 0) {
      items.push({
        label: 'Workspace Tasks',
        kind: vscode.QuickPickItemKind.Separator,
      });
      items.push(...workspaceTasks.map(mapTaskToItem));
    }

    if (detectedTasks.length > 0) {
      items.push({
        label: 'Detected Tasks',
        kind: vscode.QuickPickItemKind.Separator,
      });
      items.push(...detectedTasks.map(mapTaskToItem));
    }

    if (workspaceTasks.length === 0 && detectedTasks.length === 0) {
      items.push({
        label: 'No Tasks Found',
        kind: vscode.QuickPickItemKind.Separator,
      });
    }

    // Dedicated list actions section
    items.push({
      label: 'Actions',
      kind: vscode.QuickPickItemKind.Separator,
    });

    items.push({
      label: '$(add) Add New Task...',
      detail: 'Create a new task definition in .vscode/tasks.json',
      action: 'add',
      alwaysShow: true,
    });

    items.push({
      label: '$(gear) Edit Tasks (tasks.json)...',
      detail: 'Open and configure .vscode/tasks.json',
      action: 'configure',
      alwaysShow: true,
    });

    return items;
  }

  /**
   * Opens the QuickPick dropdown menu for selecting, adding, or editing tasks.
   */
  public async showTaskSelector(): Promise<vscode.Task | undefined> {
    if (this.activeQuickPick) {
      this.activeQuickPick.dispose();
      this.activeQuickPick = undefined;
    }

    const quickPick = vscode.window.createQuickPick<TaskQuickPickItem>();
    this.activeQuickPick = quickPick;

    quickPick.title = 'Tasks';
    quickPick.placeholder = 'Select a task to run or configure';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;

    const addButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('add'),
      tooltip: 'Add New Task',
    };

    const gearButton: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon('gear'),
      tooltip: 'Configure tasks.json',
    };

    quickPick.buttons = [addButton, gearButton];

    const tasks = await this.taskManager.fetchTasks();
    quickPick.items = this.buildQuickPickItems(tasks);

    return new Promise<vscode.Task | undefined>((resolve) => {
      let isResolved = false;
      let actionHandled = false;

      const finish = (result?: vscode.Task) => {
        if (!isResolved) {
          isResolved = true;
          resolve(result);
        }
      };

      quickPick.onDidTriggerButton(async (button) => {
        actionHandled = true;
        quickPick.hide();
        if (button === addButton || (button as { tooltip?: string }).tooltip === 'Add New Task') {
          await this.addNewTaskFlow();
        } else if (button === gearButton || (button as { tooltip?: string }).tooltip === 'Configure tasks.json') {
          await this.configureTasks();
        }
        finish(undefined);
      });

      quickPick.onDidTriggerItemButton(async (e) => {
        actionHandled = true;
        quickPick.hide();
        if (e.item?.task) {
          await this.editTask(e.item.task.name);
        }
        finish(undefined);
      });

      quickPick.onDidAccept(async () => {
        actionHandled = true;
        const selected = quickPick.selectedItems[0];
        quickPick.hide();

        if (!selected) {
          finish(undefined);
          return;
        }

        if (selected.action === 'add') {
          await this.addNewTaskFlow();
          finish(undefined);
        } else if (selected.action === 'configure') {
          await this.configureTasks();
          finish(undefined);
        } else if (selected.task) {
          await this.taskManager.setActiveTask(selected.task);
          finish(selected.task);
        } else {
          finish(undefined);
        }
      });

      quickPick.onDidHide(() => {
        if (!actionHandled) {
          finish(undefined);
        }
        if (this.activeQuickPick === quickPick) {
          this.activeQuickPick = undefined;
        }
        quickPick.dispose();
      });

      quickPick.show();
    });
  }

  /**
   * Guided interactive prompt flow to add a new task to .vscode/tasks.json:
   * 1. Task Name
   * 2. Command
   * 3. Shell or Process execution type
   * 4. Build or Test group (optional)
   *
   * Inserts the formatted task definition and selects it as active.
   */
  public async addNewTaskFlow(): Promise<TaskConfigDefinition | undefined> {
    // Step 1: Prompt for task name
    const label = await vscode.window.showInputBox({
      title: 'Add New Task (1/4): Task Name',
      prompt: 'Enter a name for the task',
      placeHolder: 'e.g. Build, Test, Start Dev Server',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Task name cannot be empty';
        }
        return undefined;
      },
    });

    if (!label) {
      return undefined;
    }

    const trimmedLabel = label.trim();
    const existing = await this.taskConfigManager.readTasksJson();
    const taskNameExists = existing?.parsed?.tasks?.some(
      (t) => t.label.toLowerCase() === trimmedLabel.toLowerCase()
    );
    if (taskNameExists) {
      const choice = await vscode.window.showWarningMessage(
        `A task named "${trimmedLabel}" already exists in tasks.json. Do you want to overwrite it?`,
        'Overwrite',
        'Cancel'
      );
      if (choice !== 'Overwrite') {
        return undefined;
      }
    }

    // Step 2: Prompt for command
    const command = await vscode.window.showInputBox({
      title: 'Add New Task (2/4): Command',
      prompt: 'Enter the command or executable to run',
      placeHolder: 'e.g. npm run build, cargo check, ./scripts/start.sh',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Command cannot be empty';
        }
        return undefined;
      },
    });

    if (!command) {
      return undefined;
    }

    // Step 3: Prompt for execution type
    const typePick = await vscode.window.showQuickPick(
      [
        {
          label: 'shell',
          description: 'Runs command inside an operating system shell (bash, zsh, cmd, powershell)',
        },
        {
          label: 'process',
          description: 'Runs executable directly as a process without a shell',
        },
      ],
      {
        title: 'Add New Task (3/4): Execution Type',
        placeHolder: 'Select execution type (shell or process)',
      }
    );

    if (!typePick) {
      return undefined;
    }

    // Step 4: Prompt for group (Build/Test)
    const groupPick = await vscode.window.showQuickPick(
      [
        {
          label: 'none',
          description: 'No group assigned',
        },
        {
          label: 'build',
          description: 'Marks this task as a build task',
        },
        {
          label: 'test',
          description: 'Marks this task as a test task',
        },
      ],
      {
        title: 'Add New Task (4/4): Task Group',
        placeHolder: 'Select task group (optional)',
      }
    );

    if (!groupPick) {
      return undefined;
    }

    const taskDefinition: TaskConfigDefinition = {
      label: label.trim(),
      type: typePick.label,
      command: command.trim(),
      problemMatcher: [],
    };

    if (groupPick.label === 'build' || groupPick.label === 'test') {
      taskDefinition.group = {
        kind: groupPick.label,
        isDefault: true,
      };
    }

    // Insert task into .vscode/tasks.json
    const writeResult = await this.taskConfigManager.addTaskDefinition(taskDefinition);
    if (!writeResult) {
      return undefined;
    }

    // Set as active task
    await this.taskManager.setActiveTaskByLabel(taskDefinition.label);

    vscode.window.showInformationMessage(
      `Task "${taskDefinition.label}" was added to tasks.json and set as active.`
    );

    return taskDefinition;
  }

  /**
   * Opens .vscode/tasks.json in editor and jumps to the task line.
   */
  public async editTask(taskLabel?: string): Promise<vscode.TextEditor | undefined> {
    const targetLabel = taskLabel ?? this.taskManager.getActiveTaskLabel();
    if (targetLabel) {
      return this.taskConfigManager.openTaskInEditor(targetLabel);
    }
    return this.taskConfigManager.openTasksJson();
  }

  /**
   * Opens .vscode/tasks.json for configuration.
   */
  public async configureTasks(): Promise<vscode.TextEditor | undefined> {
    return this.taskConfigManager.openTasksJson();
  }

  /**
   * Returns the currently active QuickPick instance if open.
   */
  public getActiveQuickPick(): vscode.QuickPick<TaskQuickPickItem> | undefined {
    return this.activeQuickPick;
  }

  /**
   * Disposes any active QuickPick or resources.
   */
  public dispose(): void {
    if (this.activeQuickPick) {
      this.activeQuickPick.dispose();
      this.activeQuickPick = undefined;
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
