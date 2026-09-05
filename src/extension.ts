import * as vscode from 'vscode';
import { COMMANDS } from './constants';
import { DebugManager } from './debugManager';
import { QuickPickController } from './quickPickController';
import { StatusBarController } from './statusBar';
import { TaskConfigManager } from './taskConfigManager';
import { TaskManager } from './taskManager';
import { TasksTreeDataProvider } from './tasksTreeDataProvider';

export interface TasksWidgetExtensionApi {
  taskManager: TaskManager;
  taskConfigManager: TaskConfigManager;
  debugManager: DebugManager;
  statusBarController: StatusBarController;
  quickPickController: QuickPickController;
}

/**
 * Activates the Task Dropdown & Runner Widget extension.
 */
export async function activate(
  context: vscode.ExtensionContext
): Promise<TasksWidgetExtensionApi> {
  const taskConfigManager = new TaskConfigManager();
  const taskManager = new TaskManager(context.workspaceState);
  const debugManager = new DebugManager();
  const statusBarController = new StatusBarController(taskManager, debugManager);
  const quickPickController = new QuickPickController(taskManager, taskConfigManager);

  // Restore active task from workspace state if previously saved
  try {
    await taskManager.restoreActiveTask();
  } catch {
    // Graceful fallback if task discovery fails initially
  }

  // 1. Select Task (opens QuickPick dropdown)
  const selectTaskCommand = vscode.commands.registerCommand(
    COMMANDS.SELECT_TASK,
    async () => {
      return quickPickController.showTaskSelector();
    }
  );

  // 2. Run Selected Task (executes active task or opens selector if none active)
  const runSelectedTaskCommand = vscode.commands.registerCommand(
    COMMANDS.RUN_SELECTED_TASK,
    async () => {
      const execution = await taskManager.executeSelectedTask();
      if (!execution) {
        const selected = await quickPickController.showTaskSelector();
        if (selected) {
          return taskManager.executeTask(selected);
        }
        return undefined;
      }
      return execution;
    }
  );

  // 3. Stop Selected Task (terminates active running task process or clicked tree task)
  const stopSelectedTaskCommand = vscode.commands.registerCommand(
    COMMANDS.STOP_SELECTED_TASK,
    async (item?: { task?: vscode.Task }) => {
      if (item?.task) {
        return taskManager.stopTask(item.task);
      }
      return taskManager.stopSelectedTask();
    }
  );

  // 4. Debug Selected Task (launches debug configuration or opens selector if none active)
  const debugSelectedTaskCommand = vscode.commands.registerCommand(
    COMMANDS.DEBUG_SELECTED_TASK,
    async () => {
      const activeLabel = taskManager.getActiveTaskLabel();
      if (!activeLabel) {
        await quickPickController.showTaskSelector();
        if (!taskManager.getActiveTaskLabel()) {
          return false;
        }
      }
      return debugManager.debugSelectedTask(taskManager);
    }
  );

  // 5. Add New Task (interactive guided prompt flow)
  const addNewTaskCommand = vscode.commands.registerCommand(
    COMMANDS.ADD_NEW_TASK,
    async () => {
      return quickPickController.addNewTaskFlow();
    }
  );

  // 6. Edit Task (opens .vscode/tasks.json at task definition)
  const editTaskCommand = vscode.commands.registerCommand(
    COMMANDS.EDIT_TASK,
    async (taskLabel?: string) => {
      return quickPickController.editTask(taskLabel);
    }
  );

  // 7. Configure tasks.json
  const configureTasksCommand = vscode.commands.registerCommand(
    COMMANDS.CONFIGURE_TASKS,
    async () => {
      return quickPickController.configureTasks();
    }
  );

  // 8. Tree Data Provider & Tree Commands
  const tasksTreeDataProvider = new TasksTreeDataProvider(taskManager);
  const sidebarTreeView = vscode.window.registerTreeDataProvider('tasksWidget.sidebarView', tasksTreeDataProvider);

  const refreshTasksCommand = vscode.commands.registerCommand(
    COMMANDS.REFRESH_TASKS,
    () => {
      tasksTreeDataProvider.refresh();
    }
  );

  const selectTreeTaskCommand = vscode.commands.registerCommand(
    COMMANDS.SELECT_TREE_TASK,
    async (task: vscode.Task) => {
      if (task) {
        await taskManager.setActiveTask(task);
      }
    }
  );

  const runTreeTaskCommand = vscode.commands.registerCommand(
    COMMANDS.RUN_TREE_TASK,
    async (item: { task?: vscode.Task }) => {
      if (item?.task) {
        return taskManager.executeTask(item.task);
      }
    }
  );

  const debugTreeTaskCommand = vscode.commands.registerCommand(
    COMMANDS.DEBUG_TREE_TASK,
    async (item: { task?: vscode.Task }) => {
      if (item?.task) {
        return debugManager.debugTask(item.task);
      }
    }
  );

  const editTreeTaskCommand = vscode.commands.registerCommand(
    COMMANDS.EDIT_TREE_TASK,
    async (item: { task?: vscode.Task }) => {
      if (item?.task) {
        const folder =
          item.task.scope && typeof item.task.scope === 'object' && 'uri' in item.task.scope
            ? (item.task.scope as vscode.WorkspaceFolder)
            : undefined;
        return quickPickController.editTask(item.task.name, folder);
      }
    }
  );

  // Register all disposables in extension context subscriptions
  context.subscriptions.push(
    taskManager,
    debugManager,
    statusBarController,
    quickPickController,
    tasksTreeDataProvider,
    sidebarTreeView,
    selectTaskCommand,
    runSelectedTaskCommand,
    stopSelectedTaskCommand,
    debugSelectedTaskCommand,
    addNewTaskCommand,
    editTaskCommand,
    configureTasksCommand,
    refreshTasksCommand,
    selectTreeTaskCommand,
    runTreeTaskCommand,
    debugTreeTaskCommand,
    editTreeTaskCommand
  );

  return {
    taskManager,
    taskConfigManager,
    debugManager,
    statusBarController,
    quickPickController,
  };
}

/**
 * Deactivates the extension.
 */
export function deactivate(): void {
  // Disposables in context.subscriptions are automatically disposed by VS Code
}
