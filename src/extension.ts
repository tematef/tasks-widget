import * as vscode from 'vscode';
import { COMMANDS } from './constants';
import { DebugManager } from './debugManager';
import { QuickPickController } from './quickPickController';
import { StatusBarController } from './statusBar';
import { TaskConfigManager } from './taskConfigManager';
import { TaskManager } from './taskManager';

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

  // 3. Stop Selected Task (terminates active running task process)
  const stopSelectedTaskCommand = vscode.commands.registerCommand(
    COMMANDS.STOP_SELECTED_TASK,
    async () => {
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

  // Register all disposables in extension context subscriptions
  context.subscriptions.push(
    taskManager,
    debugManager,
    statusBarController,
    quickPickController,
    selectTaskCommand,
    runSelectedTaskCommand,
    stopSelectedTaskCommand,
    debugSelectedTaskCommand,
    addNewTaskCommand,
    editTaskCommand,
    configureTasksCommand
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
