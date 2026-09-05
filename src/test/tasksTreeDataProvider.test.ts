import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { setupVscodeMock, MockTask, MockTaskScope, MockMemento, MockUri } from './mockVscode';

const mockEnv = setupVscodeMock();

import * as vscode from 'vscode';
import { TasksTreeDataProvider, TaskTreeItem } from '../tasksTreeDataProvider';
import { TaskManager } from '../taskManager';
import { TaskConfigManager } from '../taskConfigManager';
import { DebugManager } from '../debugManager';

describe('TasksTreeDataProvider', () => {
  let taskManager: TaskManager;
  let taskConfigManager: TaskConfigManager;
  let debugManager: DebugManager;
  let provider: TasksTreeDataProvider;

  beforeEach(() => {
    mockEnv.mockTasks.clearExecutions();
    mockEnv.mockTasks.setTasks([]);
    taskManager = new TaskManager(new MockMemento() as unknown as vscode.Memento);
    taskConfigManager = new TaskConfigManager();
    debugManager = new DebugManager();
    provider = new TasksTreeDataProvider(taskManager, taskConfigManager, debugManager);
  });

  it('should return three root categories: Selected Task, Workspace Tasks, and Detected Tasks', async () => {
    const roots = await provider.getChildren();
    assert.strictEqual(roots.length, 3);
    assert.strictEqual(roots[0].label, 'Selected Task');
    assert.strictEqual(roots[0].categoryKey, 'active');
    assert.strictEqual(roots[1].label, 'Workspace Tasks');
    assert.strictEqual(roots[1].categoryKey, 'workspace');
    assert.strictEqual(roots[2].label, 'Detected Tasks');
    assert.strictEqual(roots[2].categoryKey, 'detected');
  });

  it('should return empty item when no task is selected', async () => {
    const roots = await provider.getChildren();
    const activeCategory = roots[0];
    const children = await provider.getChildren(activeCategory);

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].itemType, 'empty');
    assert.strictEqual(children[0].label, 'No task selected');
  });

  it('should display the active task when selected', async () => {
    const task = new MockTask({ type: 'shell' }, MockTaskScope.Workspace, 'build', 'workspace');
    await taskManager.setActiveTask(task as unknown as vscode.Task);

    const roots = await provider.getChildren();
    const activeCategory = roots[0];
    const children = await provider.getChildren(activeCategory);

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].itemType, 'activeTask');
    assert.strictEqual(children[0].label, 'build');
    assert.strictEqual(children[0].description, '(selected)');
    assert.strictEqual(children[0].contextValue, 'idleTaskItem');
  });

  it('should display running status when active task is running', async () => {
    const task = new MockTask({ type: 'shell' }, MockTaskScope.Workspace, 'build', 'workspace');
    await taskManager.setActiveTask(task as unknown as vscode.Task);
    await taskManager.executeTask(task as unknown as vscode.Task);

    const roots = await provider.getChildren();
    const activeCategory = roots[0];
    const children = await provider.getChildren(activeCategory);

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].itemType, 'activeTask');
    assert.strictEqual(children[0].description, '(running)');
    assert.strictEqual(children[0].contextValue, 'runningTaskItem');
  });

  it('should return workspace tasks under Workspace Tasks category', async () => {
    const workspaceTask = new MockTask({ type: 'shell' }, MockTaskScope.Workspace, 'compile', 'workspace');
    const detectedTask = new MockTask({ type: 'npm' }, MockTaskScope.Folder, 'test', 'npm');
    mockEnv.mockTasks.setTasks([workspaceTask, detectedTask]);

    const roots = await provider.getChildren();
    const workspaceCategory = roots[1];
    const children = await provider.getChildren(workspaceCategory);

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'compile');
    assert.strictEqual(children[0].itemType, 'task');
    assert.strictEqual(children[0].command?.command, 'tasksWidget.selectTreeTask');
  });

  it('should return detected tasks under Detected Tasks category', async () => {
    const workspaceTask = new MockTask({ type: 'shell' }, MockTaskScope.Workspace, 'compile', 'workspace');
    const detectedTask = new MockTask({ type: 'npm' }, MockTaskScope.Folder, 'test', 'npm');
    mockEnv.mockTasks.setTasks([workspaceTask, detectedTask]);

    const roots = await provider.getChildren();
    const detectedCategory = roots[2];
    const children = await provider.getChildren(detectedCategory);

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'test');
    assert.strictEqual(children[0].itemType, 'task');
    assert.ok(typeof children[0].description === 'string' && children[0].description.includes('npm'));
  });

  it('should fire onDidChangeTreeData when active task or running state changes', async () => {
    let firedCount = 0;
    provider.onDidChangeTreeData(() => {
      firedCount++;
    });

    const task = new MockTask({ type: 'shell' }, MockTaskScope.Workspace, 'build', 'workspace');
    await taskManager.setActiveTask(task as unknown as vscode.Task);

    assert.ok(firedCount > 0, 'Expected tree refresh on setActiveTask');
  });

  it('should return element itself in getTreeItem', () => {
    const item = new TaskTreeItem('test', vscode.TreeItemCollapsibleState.None, 'task');
    assert.strictEqual(provider.getTreeItem(item), item);
  });

  it('should dispose cleanly without errors', () => {
    assert.doesNotThrow(() => {
      provider.dispose();
      taskManager.dispose();
      debugManager.dispose();
    });
  });
});
