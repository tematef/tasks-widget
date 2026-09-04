import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { setupVscodeMock, MockTask, MockMemento, MockUri } from './mockVscode';

const mockEnv = setupVscodeMock();

import * as vscode from 'vscode';
import { TaskManager } from '../taskManager';
import { STORAGE_KEYS } from '../constants';

describe('TaskManager', () => {
  let mockState: MockMemento;
  let task1: MockTask;
  let task2: MockTask;

  beforeEach(() => {
    mockState = new MockMemento();
    task1 = new MockTask({ type: 'shell' }, 1, 'Build Project', 'npm');
    task2 = new MockTask({ type: 'shell' }, 1, 'Run Tests', 'npm');
    mockEnv.mockTasks.setTasks([task1, task2]);
    mockEnv.mockTasks.clearExecutions();
  });


  it('should fetch tasks from vscode.tasks', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    const tasks = await manager.fetchTasks();
    assert.strictEqual(tasks.length, 2);
    assert.strictEqual(tasks[0].name, 'Build Project');
    assert.strictEqual(tasks[1].name, 'Run Tests');
    manager.dispose();
  });

  it('should find task by label', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    const task = await manager.getTaskByLabel('Run Tests');
    assert.ok(task !== undefined);
    assert.strictEqual(task?.name, 'Run Tests');

    const notFound = await manager.getTaskByLabel('Nonexistent');
    assert.strictEqual(notFound, undefined);
    manager.dispose();
  });

  it('should set active task and persist to workspaceState', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    let eventFiredWith: vscode.Task | undefined;
    manager.onDidChangeActiveTask((t) => {
      eventFiredWith = t;
    });

    await manager.setActiveTask(task1 as unknown as vscode.Task);
    assert.strictEqual(manager.getActiveTask()?.name, 'Build Project');
    assert.strictEqual(manager.getActiveTaskLabel(), 'Build Project');
    assert.strictEqual(mockState.get<string>(STORAGE_KEYS.ACTIVE_TASK_LABEL), 'Build Project');
    assert.strictEqual(eventFiredWith?.name, 'Build Project');

    await manager.setActiveTask(undefined);
    assert.strictEqual(manager.getActiveTask(), undefined);
    assert.strictEqual(manager.getActiveTaskLabel(), undefined);
    assert.strictEqual(mockState.get<string>(STORAGE_KEYS.ACTIVE_TASK_LABEL), undefined);
    manager.dispose();
  });

  it('should set active task by label', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    const resolved = await manager.setActiveTaskByLabel('Run Tests');
    assert.ok(resolved !== undefined);
    assert.strictEqual(resolved?.name, 'Run Tests');
    assert.strictEqual(manager.getActiveTask()?.name, 'Run Tests');
    assert.strictEqual(mockState.get<string>(STORAGE_KEYS.ACTIVE_TASK_LABEL), 'Run Tests');

    const notFound = await manager.setActiveTaskByLabel('Unknown Task');
    assert.strictEqual(notFound, undefined);
    assert.strictEqual(mockState.get<string>(STORAGE_KEYS.ACTIVE_TASK_LABEL), 'Unknown Task');
    manager.dispose();
  });

  it('should restore active task from workspaceState', async () => {
    await mockState.update(STORAGE_KEYS.ACTIVE_TASK_LABEL, 'Run Tests');
    const manager = new TaskManager(mockState as unknown as vscode.Memento);

    const restored = await manager.restoreActiveTask();
    assert.ok(restored !== undefined);
    assert.strictEqual(restored?.name, 'Run Tests');
    assert.strictEqual(manager.getActiveTask()?.name, 'Run Tests');
    manager.dispose();
  });

  it('should return undefined when restoring if no saved task or task not found', async () => {
    const manager1 = new TaskManager(mockState as unknown as vscode.Memento);
    const restored1 = await manager1.restoreActiveTask();
    assert.strictEqual(restored1, undefined);
    manager1.dispose();

    await mockState.update(STORAGE_KEYS.ACTIVE_TASK_LABEL, 'Deleted Task');
    const manager2 = new TaskManager(mockState as unknown as vscode.Memento);
    const restored2 = await manager2.restoreActiveTask();
    assert.strictEqual(restored2, undefined);
    manager2.dispose();
  });

  it('should execute task and track running execution', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    let runningChangeCount = 0;
    let lastRunningState = false;

    manager.onDidChangeRunningState((e) => {
      runningChangeCount++;
      lastRunningState = e.isRunning;
    });

    assert.strictEqual(manager.isRunning(task1 as unknown as vscode.Task), false);
    const execution = await manager.executeTask(task1 as unknown as vscode.Task);
    assert.ok(execution !== undefined);
    assert.strictEqual(manager.isRunning(task1 as unknown as vscode.Task), true);
    assert.strictEqual(manager.isTaskRunning('Build Project'), true);
    assert.strictEqual(lastRunningState, true);
    assert.strictEqual(runningChangeCount, 1);

    const trackedExecution = manager.getRunningExecution(task1 as unknown as vscode.Task);
    assert.strictEqual(trackedExecution, execution);

    const runningMap = manager.getRunningExecutions();
    assert.strictEqual(runningMap.size, 1);
    assert.strictEqual(runningMap.get('Build Project'), execution);

    manager.dispose();
  });

  it('should execute selected task', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    await manager.setActiveTask(task2 as unknown as vscode.Task);

    assert.strictEqual(manager.isSelectedTaskRunning(), false);
    const execution = await manager.executeSelectedTask();
    assert.ok(execution !== undefined);
    assert.strictEqual(manager.isSelectedTaskRunning(), true);

    manager.dispose();
  });

  it('should stop running task and terminate execution', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    await manager.executeTask(task1 as unknown as vscode.Task);
    assert.strictEqual(manager.isRunning(task1 as unknown as vscode.Task), true);

    const stopped = await manager.stopTask(task1 as unknown as vscode.Task);
    assert.strictEqual(stopped, true);
    assert.strictEqual(manager.isRunning(task1 as unknown as vscode.Task), false);

    // Stopping already stopped task returns false
    const stoppedAgain = await manager.stopTask(task1 as unknown as vscode.Task);
    assert.strictEqual(stoppedAgain, false);

    manager.dispose();
  });

  it('should stop selected task', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    await manager.setActiveTask(task1 as unknown as vscode.Task);
    await manager.executeSelectedTask();
    assert.strictEqual(manager.isSelectedTaskRunning(), true);

    const stopped = await manager.stopSelectedTask();
    assert.strictEqual(stopped, true);
    assert.strictEqual(manager.isSelectedTaskRunning(), false);

    manager.dispose();
  });

  it('should update running state on task lifecycle events', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    const execution = await mockEnv.mockTasks.executeTask(task1);

    assert.strictEqual(manager.isRunning(task1 as unknown as vscode.Task), true);

    mockEnv.mockTasks.terminateExecution(execution);
    assert.strictEqual(manager.isRunning(task1 as unknown as vscode.Task), false);

    manager.dispose();
  });

  it('should allow setting and getting workspace state', () => {
    const manager = new TaskManager();
    assert.strictEqual(manager.getWorkspaceState(), undefined);

    manager.setWorkspaceState(mockState as unknown as vscode.Memento);
    assert.strictEqual(manager.getWorkspaceState(), mockState);
    manager.dispose();
  });

  it('should synchronize pre-existing executions on TaskManager startup', async () => {
    const exec = await mockEnv.mockTasks.executeTask(task1);
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    assert.strictEqual(manager.isRunning(task1 as unknown as vscode.Task), true);
    assert.strictEqual(manager.getRunningExecutions().size, 1);
    manager.dispose();
    mockEnv.mockTasks.terminateExecution(exec);
  });

  it('should detect running state and stop selected task when active task is unresolved by instance', async () => {
    await mockState.update(STORAGE_KEYS.ACTIVE_TASK_LABEL, 'Unresolved Task');
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    assert.strictEqual(manager.getActiveTask(), undefined);
    assert.strictEqual(manager.getActiveTaskLabel(), 'Unresolved Task');

    const fakeTask = new MockTask({ type: 'shell' }, 1, 'Unresolved Task', 'workspace');
    const exec = await mockEnv.mockTasks.executeTask(fakeTask);

    assert.strictEqual(manager.isSelectedTaskRunning(), true);
    const stopped = await manager.stopSelectedTask();
    assert.strictEqual(stopped, true);
    assert.strictEqual(manager.isSelectedTaskRunning(), false);

    manager.dispose();
  });

  it('should report isRunning false immediately after stopTask even when taskExecution remains pending in vscode.tasks', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    await manager.setActiveTask(task1 as unknown as vscode.Task);
    const execution = await manager.executeTask(task1 as unknown as vscode.Task);

    assert.strictEqual(manager.isSelectedTaskRunning(), true);

    // Stop the task
    const stopped = await manager.stopSelectedTask();
    assert.strictEqual(stopped, true);

    // Verify isRunning returns false immediately, even while execution is still present in vscode.tasks.taskExecutions
    assert.strictEqual(manager.isRunning(task1 as unknown as vscode.Task), false);
    assert.strictEqual(manager.isSelectedTaskRunning(), false);

    // Now simulate the async event when the process finally exits
    mockEnv.mockTasks.onDidEndTaskEmitter.fire({ execution: execution as any });
    assert.strictEqual(manager.isRunning(task1 as unknown as vscode.Task), false);

    manager.dispose();
  });

  it('should track multiple executions when tasks share the same name', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    const taskA1 = new MockTask({ type: 'shell' }, { name: 'folder1' } as any, 'Shared Task', 'workspace');
    const taskA2 = new MockTask({ type: 'shell' }, { name: 'folder2' } as any, 'Shared Task', 'workspace');

    const exec1 = await manager.executeTask(taskA1 as unknown as vscode.Task);
    const exec2 = await manager.executeTask(taskA2 as unknown as vscode.Task);

    assert.strictEqual(manager.isRunning(taskA1 as unknown as vscode.Task), true);

    // Stop first execution
    await manager.stopTask(taskA1 as unknown as vscode.Task);

    // Second execution should still be running
    assert.strictEqual(manager.isRunning(taskA2 as unknown as vscode.Task), true);

    // Stop second execution
    await manager.stopTask(taskA2 as unknown as vscode.Task);
    assert.strictEqual(manager.isRunning(taskA2 as unknown as vscode.Task), false);

    manager.dispose();
  });

  it('should retain terminating state across onDidEndTaskProcess until onDidEndTask', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    const task = new MockTask({ type: 'shell' }, 1, 'Long Task', 'npm');
    mockEnv.mockTasks.setTasks([task]);

    const execution = await manager.executeTask(task as unknown as vscode.Task);
    assert.strictEqual(manager.isRunning(task as unknown as vscode.Task), true);

    await manager.stopTask(task as unknown as vscode.Task);
    assert.strictEqual(manager.isRunning(task as unknown as vscode.Task), false);

    // Process ends, but VS Code has not yet removed task from taskExecutions
    mockEnv.mockTasks.onDidEndTaskProcessEmitter.fire({
      execution: execution as any,
      exitCode: 0,
    });

    // Should still report not running (no flicker to true)
    assert.strictEqual(manager.isRunning(task as unknown as vscode.Task), false);

    // Task completely ends
    mockEnv.mockTasks.onDidEndTaskEmitter.fire({
      execution: execution as any,
    });

    assert.strictEqual(manager.isRunning(task as unknown as vscode.Task), false);
    manager.dispose();
  });

  it('should safely handle tasks with null scope without throwing', async () => {
    const manager = new TaskManager(mockState as unknown as vscode.Memento);
    const nullScopeTaskA = new MockTask({ type: 'shell' }, null, 'Null Scope Task', 'custom');
    const nullScopeTaskB = new MockTask({ type: 'shell' }, null, 'Null Scope Task', 'custom');
    const folderScopeTask = new MockTask({ type: 'shell' }, { uri: MockUri.file('/path') }, 'Null Scope Task', 'custom');

    assert.strictEqual(
      (manager as any).matchesTask(nullScopeTaskA as unknown as vscode.Task, nullScopeTaskB as unknown as vscode.Task),
      true
    );

    assert.strictEqual(
      (manager as any).matchesTask(nullScopeTaskA as unknown as vscode.Task, folderScopeTask as unknown as vscode.Task),
      false
    );

    manager.dispose();
  });
});
