import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import {
  setupVscodeMock,
  MockExtensionContext,
  MockTask,
  MockTaskExecution,
} from './mockVscode';

const mockEnv = setupVscodeMock({
  '/mock/workspace/.vscode/tasks.json': Buffer.from(
    JSON.stringify({
      version: '2.0.0',
      tasks: [
        {
          label: 'Test Build',
          type: 'shell',
          command: 'npm run build',
        },
      ],
    }),
    'utf8'
  ),
  '/mock/workspace/.vscode/launch.json': Buffer.from(
    JSON.stringify({
      version: '0.2.0',
      configurations: [
        {
          name: 'Test Build',
          type: 'node',
          request: 'launch',
        },
      ],
    }),
    'utf8'
  ),
});

import * as vscode from 'vscode';
import { COMMANDS, STORAGE_KEYS } from '../constants';
import { activate, deactivate, TasksWidgetExtensionApi } from '../extension';

describe('Extension Entrypoint (extension.ts)', () => {
  let context: MockExtensionContext;
  let api: TasksWidgetExtensionApi;

  beforeEach(async () => {
    mockEnv.mockCommands.registeredCommands.clear();
    context = new MockExtensionContext();

    const sampleTask = new MockTask(
      { type: 'shell' },
      1,
      'Test Build',
      'workspace'
    );
    mockEnv.mockTasks.setTasks([sampleTask]);

    api = await activate(context as unknown as vscode.ExtensionContext);
  });

  afterEach(() => {
    for (const sub of context.subscriptions) {
      sub.dispose();
    }
    context.subscriptions.length = 0;
    mockEnv.mockCommands.registeredCommands.clear();
    mockEnv.mockTasks.clearExecutions();
  });

  it('should activate extension and return extension API', () => {
    assert.ok(api);
    assert.ok(api.taskManager);
    assert.ok(api.taskConfigManager);
    assert.ok(api.debugManager);
    assert.ok(api.statusBarController);
    assert.ok(api.quickPickController);
  });

  it('should register all expected command IDs', async () => {
    const registered = await vscode.commands.getCommands();

    assert.ok(registered.includes(COMMANDS.SELECT_TASK));
    assert.ok(registered.includes(COMMANDS.RUN_SELECTED_TASK));
    assert.ok(registered.includes(COMMANDS.STOP_SELECTED_TASK));
    assert.ok(registered.includes(COMMANDS.DEBUG_SELECTED_TASK));
    assert.ok(registered.includes(COMMANDS.ADD_NEW_TASK));
    assert.ok(registered.includes(COMMANDS.EDIT_TASK));
    assert.ok(registered.includes(COMMANDS.CONFIGURE_TASKS));
    assert.ok(registered.includes(COMMANDS.REFRESH_TASKS));
    assert.ok(registered.includes(COMMANDS.SELECT_TREE_TASK));
    assert.ok(registered.includes(COMMANDS.RUN_TREE_TASK));
    assert.ok(registered.includes(COMMANDS.DEBUG_TREE_TASK));
    assert.ok(registered.includes(COMMANDS.EDIT_TREE_TASK));
  });

  it('should push all controllers, managers, tree view, and commands into context.subscriptions', () => {
    // 4 managers/controllers + 1 tree provider + 2 tree views + 12 commands = 19 disposables
    assert.strictEqual(context.subscriptions.length, 19);
  });

  it('should execute selectTask command and open QuickPick', async () => {
    let showTaskSelectorCalled = false;
    api.quickPickController.showTaskSelector = async () => {
      showTaskSelectorCalled = true;
      return undefined;
    };

    await vscode.commands.executeCommand(COMMANDS.SELECT_TASK);
    assert.strictEqual(showTaskSelectorCalled, true);
  });

  it('should execute runSelectedTask command when active task exists', async () => {
    const task = await api.taskManager.getTaskByLabel('Test Build');
    assert.ok(task);
    await api.taskManager.setActiveTask(task);

    const exec = (await vscode.commands.executeCommand(
      COMMANDS.RUN_SELECTED_TASK
    )) as MockTaskExecution;

    assert.ok(exec);
    assert.strictEqual(exec.task.name, 'Test Build');
    assert.strictEqual(api.taskManager.isSelectedTaskRunning(), true);
  });

  it('should execute runSelectedTask command and open task selector when no task is active', async () => {
    await api.taskManager.setActiveTask(undefined);
    await context.workspaceState.update(STORAGE_KEYS.ACTIVE_TASK_LABEL, undefined);

    let showTaskSelectorCalled = false;
    api.quickPickController.showTaskSelector = async () => {
      showTaskSelectorCalled = true;
      return undefined;
    };

    await vscode.commands.executeCommand(COMMANDS.RUN_SELECTED_TASK);
    assert.strictEqual(showTaskSelectorCalled, true);
  });

  it('should execute stopSelectedTask command when task is running', async () => {
    const task = await api.taskManager.getTaskByLabel('Test Build');
    assert.ok(task);
    await api.taskManager.setActiveTask(task);
    await api.taskManager.executeSelectedTask();
    assert.strictEqual(api.taskManager.isSelectedTaskRunning(), true);

    const stopped = await vscode.commands.executeCommand(COMMANDS.STOP_SELECTED_TASK);
    assert.strictEqual(stopped, true);
    assert.strictEqual(api.taskManager.isSelectedTaskRunning(), false);
  });

  it('should execute debugSelectedTask command when active task exists', async () => {
    const task = await api.taskManager.getTaskByLabel('Test Build');
    assert.ok(task);
    await api.taskManager.setActiveTask(task);

    const debugged = await vscode.commands.executeCommand(COMMANDS.DEBUG_SELECTED_TASK);
    assert.strictEqual(debugged, true);
    assert.ok(mockEnv.mockDebug.activeDebugSession);
  });

  it('should prompt task selection on debugSelectedTask when no active task exists', async () => {
    await api.taskManager.setActiveTask(undefined);
    await context.workspaceState.update(STORAGE_KEYS.ACTIVE_TASK_LABEL, undefined);

    let selectorCalled = false;
    api.quickPickController.showTaskSelector = async () => {
      selectorCalled = true;
      return undefined;
    };

    const result = await vscode.commands.executeCommand(COMMANDS.DEBUG_SELECTED_TASK);
    assert.strictEqual(selectorCalled, true);
    assert.strictEqual(result, false);
  });

  it('should execute addNewTask command', async () => {
    let addNewTaskFlowCalled = false;
    api.quickPickController.addNewTaskFlow = async () => {
      addNewTaskFlowCalled = true;
      return undefined;
    };

    await vscode.commands.executeCommand(COMMANDS.ADD_NEW_TASK);
    assert.strictEqual(addNewTaskFlowCalled, true);
  });

  it('should execute editTask command with and without taskLabel argument', async () => {
    let editedLabel: string | undefined;
    api.quickPickController.editTask = async (label?: string) => {
      editedLabel = label;
      return undefined;
    };

    await vscode.commands.executeCommand(COMMANDS.EDIT_TASK, 'Test Build');
    assert.strictEqual(editedLabel, 'Test Build');

    await vscode.commands.executeCommand(COMMANDS.EDIT_TASK);
    assert.strictEqual(editedLabel, undefined);
  });

  it('should execute configureTasks command', async () => {
    let configureTasksCalled = false;
    api.quickPickController.configureTasks = async () => {
      configureTasksCalled = true;
      return undefined;
    };

    await vscode.commands.executeCommand(COMMANDS.CONFIGURE_TASKS);
    assert.strictEqual(configureTasksCalled, true);
  });

  it('should restore active task from workspace state upon activation', async () => {
    const newContext = new MockExtensionContext();
    await newContext.workspaceState.update(STORAGE_KEYS.ACTIVE_TASK_LABEL, 'Test Build');

    const newApi = await activate(newContext as unknown as vscode.ExtensionContext);
    assert.strictEqual(newApi.taskManager.getActiveTask()?.name, 'Test Build');

    for (const sub of newContext.subscriptions) {
      sub.dispose();
    }
  });

  it('should deactivate cleanly without errors', () => {
    assert.doesNotThrow(() => {
      deactivate();
    });
  });
});
