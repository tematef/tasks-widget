import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setupVscodeMock } from './mockVscode';

setupVscodeMock();

import * as vscode from 'vscode';
import { parseTasksJson, findTaskLineInContent } from '../taskConfigManager';
import { DebugManager } from '../debugManager';

describe('Workspace Verification and Sample Tasks', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const tasksJsonPath = path.join(rootDir, '.vscode', 'tasks.json');
  const launchJsonPath = path.join(rootDir, '.vscode', 'launch.json');

  it('should have a valid .vscode/tasks.json with build, watch, and test tasks', () => {
    assert.strictEqual(fs.existsSync(tasksJsonPath), true, '.vscode/tasks.json must exist');

    const content = fs.readFileSync(tasksJsonPath, 'utf8');
    const parsed = parseTasksJson(content);

    assert.strictEqual(parsed.version, '2.0.0');
    assert.ok(Array.isArray(parsed.tasks), 'tasks must be an array');
    assert.strictEqual(parsed.tasks.length, 3);

    const compileTask = parsed.tasks.find((t) => t.label === 'npm: compile');
    assert.ok(compileTask, 'compile task should exist');
    assert.strictEqual(compileTask.type, 'npm');
    assert.strictEqual(compileTask.script, 'compile');
    assert.deepStrictEqual(compileTask.group, { kind: 'build', isDefault: true });

    const watchTask = parsed.tasks.find((t) => t.label === 'npm: watch');
    assert.ok(watchTask, 'watch task should exist');
    assert.strictEqual(watchTask.type, 'npm');
    assert.strictEqual(watchTask.script, 'watch');
    assert.strictEqual(watchTask.isBackground, true);

    const testTask = parsed.tasks.find((t) => t.label === 'npm: test');
    assert.ok(testTask, 'test task should exist');
    assert.strictEqual(testTask.type, 'npm');
    assert.strictEqual(testTask.script, 'test');
    assert.deepStrictEqual(testTask.group, { kind: 'test', isDefault: true });
  });

  it('should find line numbers for all tasks in sample tasks.json', () => {
    const content = fs.readFileSync(tasksJsonPath, 'utf8');
    const compileLine = findTaskLineInContent(content, 'npm: compile');
    const watchLine = findTaskLineInContent(content, 'npm: watch');
    const testLine = findTaskLineInContent(content, 'npm: test');

    assert.ok(compileLine >= 0, 'Line number for npm: compile should be valid');
    assert.ok(watchLine >= 0, 'Line number for npm: watch should be valid');
    assert.ok(testLine >= 0, 'Line number for npm: test should be valid');
  });

  it('should have a valid .vscode/launch.json linking to build tasks', async () => {
    assert.strictEqual(fs.existsSync(launchJsonPath), true, '.vscode/launch.json must exist');

    const content = fs.readFileSync(launchJsonPath, 'utf8');
    const parsed = JSON.parse(content);

    assert.strictEqual(parsed.version, '0.2.0');
    assert.ok(Array.isArray(parsed.configurations), 'configurations must be an array');
    assert.ok(parsed.configurations.length >= 2);

    const runExtensionConfig = parsed.configurations.find((c: { name: string }) => c.name === 'Run Extension');
    assert.ok(runExtensionConfig, 'Run Extension configuration should exist');
    assert.strictEqual(runExtensionConfig.preLaunchTask, 'npm: compile');

    // Populate mock workspace filesystem with launch.json content
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'Workspace folder should exist');
    const launchUri = vscode.Uri.joinPath(folder.uri, '.vscode', 'launch.json');
    await vscode.workspace.fs.writeFile(launchUri, Buffer.from(content, 'utf8'));

    const debugManager = new DebugManager(folder);
    const match = await debugManager.findMatchingDebugConfiguration('npm: compile');
    assert.ok(match, 'DebugManager should match npm: compile via preLaunchTask');
    assert.strictEqual(match.name, 'Run Extension');
    debugManager.dispose();
  });
});
