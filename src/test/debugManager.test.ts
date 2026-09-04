import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { setupVscodeMock, MockTask, MockMemento, MockUri } from './mockVscode';

const mockEnv = setupVscodeMock();

import * as vscode from 'vscode';
import { DebugManager } from '../debugManager';
import { TaskManager } from '../taskManager';

describe('DebugManager', () => {
  const launchFilePath = '/mock/workspace/.vscode/launch.json';

  beforeEach(() => {
    for (const key of Object.keys(mockEnv.fsStorage)) {
      delete mockEnv.fsStorage[key];
    }
    mockEnv.mockDebug.activeDebugSession = undefined;
    mockEnv.mockDebug.startedDebugSessions.length = 0;
  });

  it('should return empty configurations when launch.json is missing', async () => {
    const manager = new DebugManager();
    const configs = await manager.getLaunchConfigurations();
    assert.deepStrictEqual(configs, []);
    manager.dispose();
  });

  it('should read configurations from launch.json with comments and trailing commas', async () => {
    const launchJson = `
    {
      // debug configurations
      "version": "0.2.0",
      "configurations": [
        {
          "type": "node",
          "request": "launch",
          "name": "Launch Server",
          "program": "\${workspaceFolder}/server.js",
          "preLaunchTask": "build",
        },
      ],
    }
    `;
    mockEnv.fsStorage[launchFilePath] = Buffer.from(launchJson, 'utf8');

    const manager = new DebugManager();
    const configs = await manager.getLaunchConfigurations();
    assert.strictEqual(configs.length, 1);
    assert.strictEqual(configs[0].name, 'Launch Server');
    assert.strictEqual(configs[0].preLaunchTask, 'build');
    manager.dispose();
  });

  it('should read configurations from workspace configuration when present', async () => {
    delete mockEnv.fsStorage[launchFilePath];
    const testConfigs = [{ type: 'node', request: 'launch', name: 'Config From Workspace' }];
    await vscode.workspace.getConfiguration('launch').update('configurations', testConfigs);

    const manager = new DebugManager();
    const configs = await manager.getLaunchConfigurations();
    assert.strictEqual(configs.length, 1);
    assert.strictEqual(configs[0].name, 'Config From Workspace');
    manager.dispose();

    await vscode.workspace.getConfiguration('launch').update('configurations', undefined);
  });

  it('should match debug configuration by exact name', async () => {
    const launchJson = JSON.stringify({
      version: '0.2.0',
      configurations: [
        { type: 'node', request: 'launch', name: 'Build App' },
        { type: 'node', request: 'launch', name: 'Run Tests' },
      ],
    });
    mockEnv.fsStorage[launchFilePath] = Buffer.from(launchJson, 'utf8');

    const manager = new DebugManager();
    const match = await manager.findMatchingDebugConfiguration('Build App');
    assert.ok(match !== undefined);
    assert.strictEqual(match?.name, 'Build App');
    manager.dispose();
  });

  it('should match debug configuration by preLaunchTask', async () => {
    const launchJson = JSON.stringify({
      version: '0.2.0',
      configurations: [
        { type: 'node', request: 'launch', name: 'Start API Server', preLaunchTask: 'compile' },
      ],
    });
    mockEnv.fsStorage[launchFilePath] = Buffer.from(launchJson, 'utf8');

    const manager = new DebugManager();
    const match = await manager.findMatchingDebugConfiguration('compile');
    assert.ok(match !== undefined);
    assert.strictEqual(match?.name, 'Start API Server');
    manager.dispose();
  });

  it('should match debug configuration case-insensitively and via substring', async () => {
    const launchJson = JSON.stringify({
      version: '0.2.0',
      configurations: [
        { type: 'node', request: 'launch', name: 'Debug: Test Runner' },
      ],
    });
    mockEnv.fsStorage[launchFilePath] = Buffer.from(launchJson, 'utf8');

    const manager = new DebugManager();
    const match = await manager.findMatchingDebugConfiguration('test runner');
    assert.ok(match !== undefined);
    assert.strictEqual(match?.name, 'Debug: Test Runner');
    manager.dispose();
  });

  it('should initiate debugging with matching launch configuration', async () => {
    const launchJson = JSON.stringify({
      version: '0.2.0',
      configurations: [
        { type: 'node', request: 'launch', name: 'My Task', program: 'app.js' },
      ],
    });
    mockEnv.fsStorage[launchFilePath] = Buffer.from(launchJson, 'utf8');

    const manager = new DebugManager();
    const result = await manager.debugTask('My Task');
    assert.strictEqual(result, true);
    assert.strictEqual(manager.isDebugging(), true);
    assert.strictEqual(manager.getActiveDebugSession()?.name, 'My Task');
    manager.dispose();
  });

  it('should fallback to initiating debug session by task name when no match found', async () => {
    const manager = new DebugManager();
    const result = await manager.debugTask('unmatched-task');
    assert.strictEqual(result, true);
    assert.strictEqual(mockEnv.mockDebug.startedDebugSessions.length, 1);
    assert.strictEqual(mockEnv.mockDebug.startedDebugSessions[0].name, 'unmatched-task');
    manager.dispose();
  });

  it('should initiate debugging for selected task in TaskManager', async () => {
    const launchJson = JSON.stringify({
      version: '0.2.0',
      configurations: [
        { type: 'node', request: 'launch', name: 'Debug Watch', preLaunchTask: 'watch' },
      ],
    });
    mockEnv.fsStorage[launchFilePath] = Buffer.from(launchJson, 'utf8');

    const taskManager = new TaskManager(new MockMemento() as unknown as vscode.Memento);
    const watchTask = new MockTask({ type: 'shell' }, 1, 'watch', 'npm');
    await taskManager.setActiveTask(watchTask as unknown as vscode.Task);

    const debugManager = new DebugManager();
    const result = await debugManager.debugSelectedTask(taskManager);
    assert.strictEqual(result, true);
    assert.strictEqual(debugManager.isDebugging(), true);
    assert.strictEqual(debugManager.getActiveDebugSession()?.name, 'Debug Watch');

    taskManager.dispose();
    debugManager.dispose();
  });

  it('should return false when debugging selected task if no task is active or restored', async () => {
    const taskManager = new TaskManager(new MockMemento() as unknown as vscode.Memento);
    const debugManager = new DebugManager();

    const result = await debugManager.debugSelectedTask(taskManager);
    assert.strictEqual(result, false);

    taskManager.dispose();
    debugManager.dispose();
  });

  it('should fire onDidChangeActiveDebugSession when session starts or ends', async () => {
    const manager = new DebugManager();
    let sessionEvents: Array<vscode.DebugSession | undefined> = [];

    manager.onDidChangeActiveDebugSession((session) => {
      sessionEvents.push(session);
    });

    await manager.debugTask('test-session');
    assert.strictEqual(sessionEvents.length, 1);
    assert.ok(sessionEvents[0] !== undefined);

    mockEnv.mockDebug.stopDebugging();
    assert.strictEqual(sessionEvents.length, 2);
    assert.strictEqual(sessionEvents[1], undefined);

    manager.dispose();
  });

  it('should not match debug configuration via substring when task name is 2 or fewer characters', async () => {
    const launchJson = JSON.stringify({
      version: '0.2.0',
      configurations: [
        { type: 'node', request: 'launch', name: 'Run Specific Test' },
      ],
    });
    mockEnv.fsStorage[launchFilePath] = Buffer.from(launchJson, 'utf8');

    const manager = new DebugManager();
    const match = await manager.findMatchingDebugConfiguration('ci');
    assert.strictEqual(match, undefined);
    manager.dispose();
  });
});
