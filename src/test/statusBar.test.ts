import { describe, it, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { setupVscodeMock, MockMemento, MockTask, MockTaskExecution, MockStatusBarItem } from './mockVscode';

const mockEnv = setupVscodeMock();

import { COMMANDS, CONFIG_SECTION, CONFIG_KEYS } from '../constants';
import { TaskManager } from '../taskManager';
import { DebugManager } from '../debugManager';
import { StatusBarController } from '../statusBar';

describe('StatusBarController', () => {
  let memento: MockMemento;
  let taskManager: TaskManager;
  let debugManager: DebugManager;

  beforeEach(() => {
    memento = new MockMemento();
    taskManager = new TaskManager(memento);
    debugManager = new DebugManager();
  });

  afterEach(async () => {
    const config = mockEnv.vscodeModule.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(CONFIG_KEYS.SHOW_DEBUG_BUTTON, undefined);
    await config.update(CONFIG_KEYS.STATUS_BAR_PRIORITY, undefined);
    await config.update(CONFIG_KEYS.SHOW_STATUS_BAR_WIDGET, undefined);
  });

  it('should initialize with default states when no task is selected', () => {
    const controller = new StatusBarController(taskManager, debugManager);

    const selectorItem = controller.getTaskSelectorItem() as unknown as MockStatusBarItem;
    const playStopItem = controller.getPlayStopItem() as unknown as MockStatusBarItem;
    const debugItem = controller.getDebugItem() as unknown as MockStatusBarItem;

    assert.strictEqual(selectorItem.text, '$(checklist) Select Task \u25BE');
    assert.strictEqual(selectorItem.command, COMMANDS.SELECT_TASK);
    assert.strictEqual(selectorItem.isVisible, true);

    assert.strictEqual(playStopItem.text, '$(play)');
    assert.strictEqual(playStopItem.command, COMMANDS.RUN_SELECTED_TASK);
    assert.strictEqual(playStopItem.tooltip, 'Run Selected Task');
    assert.strictEqual(playStopItem.isVisible, true);

    assert.strictEqual(debugItem.text, '$(debug-alt)');
    assert.strictEqual(debugItem.command, COMMANDS.DEBUG_SELECTED_TASK);
    assert.strictEqual(debugItem.tooltip, 'Debug Selected Task');
    assert.strictEqual(debugItem.isVisible, true);

    controller.dispose();
  });

  it('should display the active task label and update tooltips when a task is selected', async () => {
    const buildTask = new MockTask(
      { type: 'shell' },
      1,
      'Build App',
      'npm'
    );
    mockEnv.mockTasks.setTasks([buildTask]);

    const controller = new StatusBarController(taskManager, debugManager);

    await taskManager.setActiveTask(buildTask as any);

    const selectorItem = controller.getTaskSelectorItem() as unknown as MockStatusBarItem;
    const playStopItem = controller.getPlayStopItem() as unknown as MockStatusBarItem;
    const debugItem = controller.getDebugItem() as unknown as MockStatusBarItem;

    assert.strictEqual(selectorItem.text, '$(checklist) Build App \u25BE');
    assert.ok(selectorItem.tooltip?.includes('Build App'));

    assert.strictEqual(playStopItem.text, '$(play)');
    assert.strictEqual(playStopItem.command, COMMANDS.RUN_SELECTED_TASK);
    assert.strictEqual(playStopItem.tooltip, "Run 'Build App'");

    assert.strictEqual(debugItem.text, '$(debug-alt)');
    assert.strictEqual(debugItem.command, COMMANDS.DEBUG_SELECTED_TASK);
    assert.strictEqual(debugItem.tooltip, "Debug 'Build App'");

    controller.dispose();
  });

  it('should dynamically switch from Play to Stop when a task starts running', async () => {
    const testTask = new MockTask(
      { type: 'shell' },
      1,
      'Test Suite',
      'npm'
    );
    mockEnv.mockTasks.setTasks([testTask]);

    const controller = new StatusBarController(taskManager, debugManager);
    await taskManager.setActiveTask(testTask as any);

    const playStopItem = controller.getPlayStopItem() as unknown as MockStatusBarItem;
    assert.strictEqual(playStopItem.text, '$(play)');
    assert.strictEqual(playStopItem.command, COMMANDS.RUN_SELECTED_TASK);

    // Execute task
    const execution = await taskManager.executeTask(testTask as any);

    // Should now show Stop button
    assert.strictEqual(playStopItem.text, '$(debug-stop)');
    assert.strictEqual(playStopItem.command, COMMANDS.STOP_SELECTED_TASK);
    assert.strictEqual(playStopItem.tooltip, "Stop 'Test Suite'");

    // Terminate execution
    mockEnv.mockTasks.terminateExecution(execution as any);

    // Should swap back to Play button
    assert.strictEqual(playStopItem.text, '$(play)');
    assert.strictEqual(playStopItem.command, COMMANDS.RUN_SELECTED_TASK);
    assert.strictEqual(playStopItem.tooltip, "Run 'Test Suite'");

    controller.dispose();
  });

  it('should react to task process lifecycle events directly (onDidStartTaskProcess and onDidEndTaskProcess)', async () => {
    const watchTask = new MockTask(
      { type: 'shell' },
      1,
      'Watch Files',
      'npm'
    );
    mockEnv.mockTasks.setTasks([watchTask]);

    const controller = new StatusBarController(taskManager, debugManager);
    await taskManager.setActiveTask(watchTask as any);

    const playStopItem = controller.getPlayStopItem() as unknown as MockStatusBarItem;
    assert.strictEqual(playStopItem.text, '$(play)');

    // Fire task process start event directly
    const execution = new MockTaskExecution(watchTask);
    mockEnv.mockTasks.onDidStartTaskProcessEmitter.fire({
      execution: execution as any,
      processId: 1234,
    });

    assert.strictEqual(playStopItem.text, '$(debug-stop)');
    assert.strictEqual(playStopItem.command, COMMANDS.STOP_SELECTED_TASK);

    // Fire task process end event directly
    mockEnv.mockTasks.onDidEndTaskProcessEmitter.fire({
      execution: execution as any,
      exitCode: 0,
    });

    assert.strictEqual(playStopItem.text, '$(play)');
    assert.strictEqual(playStopItem.command, COMMANDS.RUN_SELECTED_TASK);

    controller.dispose();
  });

  it('should hide or show the debug button based on configuration', async () => {
    const controller = new StatusBarController(taskManager, debugManager);
    const debugItem = controller.getDebugItem() as unknown as MockStatusBarItem;

    assert.strictEqual(debugItem.isVisible, true);

    // Disable debug button via configuration
    const config = mockEnv.vscodeModule.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(CONFIG_KEYS.SHOW_DEBUG_BUTTON, false);

    assert.strictEqual(debugItem.isVisible, false);

    // Re-enable debug button
    await config.update(CONFIG_KEYS.SHOW_DEBUG_BUTTON, true);

    assert.strictEqual(debugItem.isVisible, true);

    controller.dispose();
  });

  it('should hide or show all status bar items when showStatusBarWidget configuration is toggled', async () => {
    const controller = new StatusBarController(taskManager, debugManager);

    const selectorItem = controller.getTaskSelectorItem() as unknown as MockStatusBarItem;
    const playStopItem = controller.getPlayStopItem() as unknown as MockStatusBarItem;
    const debugItem = controller.getDebugItem() as unknown as MockStatusBarItem;

    assert.strictEqual(selectorItem.isVisible, true);
    assert.strictEqual(playStopItem.isVisible, true);
    assert.strictEqual(debugItem.isVisible, true);

    // Disable status bar widget
    const config = mockEnv.vscodeModule.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(CONFIG_KEYS.SHOW_STATUS_BAR_WIDGET, false);

    assert.strictEqual(selectorItem.isVisible, false);
    assert.strictEqual(playStopItem.isVisible, false);
    assert.strictEqual(debugItem.isVisible, false);

    // Re-enable status bar widget
    await config.update(CONFIG_KEYS.SHOW_STATUS_BAR_WIDGET, true);

    assert.strictEqual(selectorItem.isVisible, true);
    assert.strictEqual(playStopItem.isVisible, true);
    assert.strictEqual(debugItem.isVisible, true);

    controller.dispose();
  });

  it('should recreate status bar items with updated priority on configuration change', async () => {
    const controller = new StatusBarController(taskManager, debugManager);
    const oldSelectorItem = controller.getTaskSelectorItem() as unknown as MockStatusBarItem;

    const config = mockEnv.vscodeModule.workspace.getConfiguration(CONFIG_SECTION);
    await config.update(CONFIG_KEYS.STATUS_BAR_PRIORITY, 200);

    const newSelectorItem = controller.getTaskSelectorItem() as unknown as MockStatusBarItem;
    assert.strictEqual(oldSelectorItem.isDisposed, true);
    assert.strictEqual(newSelectorItem.priority, 200);

    controller.dispose();
  });

  it('should dispose all status bar items and event listeners', () => {
    const controller = new StatusBarController(taskManager, debugManager);

    const selectorItem = controller.getTaskSelectorItem() as unknown as MockStatusBarItem;
    const playStopItem = controller.getPlayStopItem() as unknown as MockStatusBarItem;
    const debugItem = controller.getDebugItem() as unknown as MockStatusBarItem;

    controller.dispose();

    assert.strictEqual(selectorItem.isDisposed, true);
    assert.strictEqual(playStopItem.isDisposed, true);
    assert.strictEqual(debugItem.isDisposed, true);
  });
});
