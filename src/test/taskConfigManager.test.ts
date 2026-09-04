import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { setupVscodeMock, MockUri } from './mockVscode';

// Setup vscode mock before importing modules that depend on 'vscode'
const mockEnv = setupVscodeMock();

import { COMMANDS, CONFIG_SECTION, CONFIG_KEYS, STORAGE_KEYS, DEFAULTS } from '../constants';
import {
  stripJsonComments,
  stripTrailingCommas,
  parseTasksJson,
  formatTasksJson,
  insertOrUpdateTaskInJson,
  findTaskLineInContent,
  findTaskPositionInContent,
  TaskConfigManager,
  TaskConfigDefinition,
} from '../taskConfigManager';

describe('Task Dropdown Constants', () => {
  it('should define all required command IDs', () => {
    assert.strictEqual(COMMANDS.SELECT_TASK, 'tasksWidget.selectTask');
    assert.strictEqual(COMMANDS.RUN_SELECTED_TASK, 'tasksWidget.runSelectedTask');
    assert.strictEqual(COMMANDS.STOP_SELECTED_TASK, 'tasksWidget.stopSelectedTask');
    assert.strictEqual(COMMANDS.DEBUG_SELECTED_TASK, 'tasksWidget.debugSelectedTask');
    assert.strictEqual(COMMANDS.ADD_NEW_TASK, 'tasksWidget.addNewTask');
    assert.strictEqual(COMMANDS.EDIT_TASK, 'tasksWidget.editTask');
    assert.strictEqual(COMMANDS.CONFIGURE_TASKS, 'tasksWidget.configureTasks');
  });

  it('should define correct configuration keys', () => {
    assert.strictEqual(CONFIG_SECTION, 'tasksWidget');
    assert.strictEqual(CONFIG_KEYS.SHOW_DEBUG_BUTTON, 'showDebugButton');
    assert.strictEqual(CONFIG_KEYS.STATUS_BAR_PRIORITY, 'statusBarPriority');
  });

  it('should define correct workspace storage keys', () => {
    assert.strictEqual(STORAGE_KEYS.ACTIVE_TASK_LABEL, 'tasksWidget.activeTaskLabel');
    assert.strictEqual(STORAGE_KEYS.ACTIVE_TASK_ID, 'tasksWidget.activeTaskId');
  });

  it('should define default configuration values', () => {
    assert.strictEqual(DEFAULTS.STATUS_BAR_PRIORITY, 100);
    assert.strictEqual(DEFAULTS.TASKS_FILE_NAME, 'tasks.json');
    assert.strictEqual(DEFAULTS.VSCODE_DIR_NAME, '.vscode');
    assert.strictEqual(DEFAULTS.TASKS_VERSION, '2.0.0');
  });
});

describe('JSON Utilities', () => {
  it('should strip single-line and multi-line comments while preserving string content', () => {
    const raw = `
    {
      // This is a single line comment
      "url": "http://example.com/api", // comment after property
      /* This is a
         multi-line comment */
      "message": "String with // not a comment and /* not a comment */"
    }
    `;
    const stripped = stripJsonComments(raw);
    assert.ok(!stripped.includes('This is a single line comment'));
    assert.ok(!stripped.includes('multi-line comment'));
    assert.ok(stripped.includes('"http://example.com/api"'));
    assert.ok(stripped.includes('"String with // not a comment and /* not a comment */"'));
  });

  it('should strip trailing commas before closing braces and brackets', () => {
    const withCommas = '{"items": [1, 2, ], "obj": {"a": 1, }, }';
    const cleaned = stripTrailingCommas(withCommas);
    assert.strictEqual(cleaned, '{"items": [1, 2 ], "obj": {"a": 1 } }');
    const parsed = JSON.parse(cleaned);
    assert.deepStrictEqual(parsed, { items: [1, 2], obj: { a: 1 } });
  });

  it('should preserve commas inside string literals when stripping trailing commas', () => {
    const jsonWithStringComma = '{"cmd": "echo {a, }", "arg": "[1, ]", "items": ["foo", ], }';
    const cleaned = stripTrailingCommas(jsonWithStringComma);
    const parsed = JSON.parse(cleaned);
    assert.strictEqual(parsed.cmd, 'echo {a, }');
    assert.strictEqual(parsed.arg, '[1, ]');
    assert.deepStrictEqual(parsed.items, ['foo']);
  });

  it('should parse tasks.json with comments and trailing commas', () => {
    const jsonc = `
    {
      // tasks configuration
      "version": "2.0.0",
      "tasks": [
        {
          "label": "build",
          "type": "shell",
          "command": "npm run build",
        },
      ],
    }
    `;
    const parsed = parseTasksJson(jsonc);
    assert.strictEqual(parsed.version, '2.0.0');
    assert.strictEqual(parsed.tasks?.length, 1);
    assert.strictEqual(parsed.tasks?.[0].label, 'build');
    assert.strictEqual(parsed.tasks?.[0].command, 'npm run build');
  });

  it('should return default structure for empty or invalid json', () => {
    const fromEmpty = parseTasksJson('');
    assert.strictEqual(fromEmpty.version, '2.0.0');
    assert.deepStrictEqual(fromEmpty.tasks, []);

    const fromInvalid = parseTasksJson('invalid json {');
    assert.strictEqual(fromInvalid.version, '2.0.0');
    assert.deepStrictEqual(fromInvalid.tasks, []);
  });

  it('should format tasks.json structure with 2-space indentation', () => {
    const structure = {
      version: '2.0.0',
      tasks: [{ label: 'test', type: 'shell', command: 'npm test' }],
    };
    const formatted = formatTasksJson(structure);
    assert.ok(formatted.endsWith('\n'));
    assert.ok(formatted.includes('  "version": "2.0.0"'));
    assert.ok(formatted.includes('  "tasks": ['));
  });
});

describe('Task Insertion and Updates', () => {
  it('should insert a new task into empty JSON content', () => {
    const newTask: TaskConfigDefinition = {
      label: 'compile',
      type: 'shell',
      command: 'tsc -p ./',
      group: 'build',
    };
    const result = insertOrUpdateTaskInJson('', newTask);
    const parsed = parseTasksJson(result);
    assert.strictEqual(parsed.tasks?.length, 1);
    assert.strictEqual(parsed.tasks?.[0].label, 'compile');
    assert.strictEqual(parsed.tasks?.[0].command, 'tsc -p ./');
  });

  it('should append a new task when not matching existing labels', () => {
    const initial = JSON.stringify({
      version: '2.0.0',
      tasks: [{ label: 'build', type: 'shell', command: 'make' }],
    });
    const newTask: TaskConfigDefinition = {
      label: 'test',
      type: 'shell',
      command: 'npm test',
    };
    const result = insertOrUpdateTaskInJson(initial, newTask);
    const parsed = parseTasksJson(result);
    assert.strictEqual(parsed.tasks?.length, 2);
    assert.strictEqual(parsed.tasks?.[0].label, 'build');
    assert.strictEqual(parsed.tasks?.[1].label, 'test');
  });

  it('should update an existing task when matching label', () => {
    const initial = JSON.stringify({
      version: '2.0.0',
      tasks: [
        { label: 'build', type: 'shell', command: 'make old' },
        { label: 'test', type: 'shell', command: 'npm test' },
      ],
    });
    const updatedTask: TaskConfigDefinition = {
      label: 'build',
      type: 'shell',
      command: 'make new',
      group: 'build',
    };
    const result = insertOrUpdateTaskInJson(initial, updatedTask);
    const parsed = parseTasksJson(result);
    assert.strictEqual(parsed.tasks?.length, 2);
    assert.strictEqual(parsed.tasks?.[0].label, 'build');
    assert.strictEqual(parsed.tasks?.[0].command, 'make new');
    assert.strictEqual(parsed.tasks?.[1].label, 'test');
  });
});

describe('Task Line and Position Resolution', () => {
  const sampleTasksJson = `{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Build App",
      "type": "shell",
      "command": "npm run build"
    },
    {
      "taskName": "Legacy Task",
      "type": "process"
    }
  ]
}`;

  it('should find exact 0-indexed line number for task label', () => {
    const line = findTaskLineInContent(sampleTasksJson, 'Build App');
    assert.strictEqual(line, 4);
  });

  it('should find line number for legacy taskName', () => {
    const line = findTaskLineInContent(sampleTasksJson, 'Legacy Task');
    assert.strictEqual(line, 9);
  });

  it('should return -1 when task label is not found', () => {
    const line = findTaskLineInContent(sampleTasksJson, 'Nonexistent Task');
    assert.strictEqual(line, -1);
  });

  it('should resolve character offset for task position', () => {
    const pos = findTaskPositionInContent(sampleTasksJson, 'Build App');
    assert.ok(pos !== undefined);
    assert.strictEqual(pos?.line, 4);
    assert.strictEqual(pos?.character, 16);
  });
});

describe('TaskConfigManager Workspace Operations', () => {
  const workspacePath = '/mock/workspace';
  const tasksFilePath = '/mock/workspace/.vscode/tasks.json';

  beforeEach(() => {
    for (const key of Object.keys(mockEnv.fsStorage)) {
      delete mockEnv.fsStorage[key];
    }
  });

  it('should resolve tasks.json Uri from workspace folder', () => {
    const manager = new TaskConfigManager();
    const uri = manager.getTasksFileUri();
    assert.ok(uri !== undefined);
    assert.strictEqual(uri?.fsPath, tasksFilePath);
  });

  it('should return undefined when reading nonexistent tasks.json', async () => {
    const manager = new TaskConfigManager();
    const result = await manager.readTasksJson();
    assert.strictEqual(result, undefined);
  });

  it('should read and parse existing tasks.json', async () => {
    const content = JSON.stringify({
      version: '2.0.0',
      tasks: [{ label: 'test-task', command: 'echo 1' }],
    });
    mockEnv.fsStorage[tasksFilePath] = Buffer.from(content, 'utf8');

    const manager = new TaskConfigManager();
    const result = await manager.readTasksJson();
    assert.ok(result !== undefined);
    assert.strictEqual(result?.parsed.tasks?.length, 1);
    assert.strictEqual(result?.parsed.tasks?.[0].label, 'test-task');
  });

  it('should write tasks.json and create parent directories', async () => {
    const manager = new TaskConfigManager();
    const content = JSON.stringify({ version: '2.0.0', tasks: [] });
    const writtenUri = await manager.writeTasksJson(content);
    assert.ok(writtenUri !== undefined);
    assert.strictEqual(writtenUri?.fsPath, tasksFilePath);
    assert.strictEqual(Buffer.from(mockEnv.fsStorage[tasksFilePath]).toString('utf8'), content);
  });

  it('should add task definition to workspace tasks.json', async () => {
    const manager = new TaskConfigManager();
    const newTask: TaskConfigDefinition = {
      label: 'lint',
      type: 'shell',
      command: 'eslint .',
    };

    const writtenUri = await manager.addTaskDefinition(newTask);
    assert.ok(writtenUri !== undefined);

    const saved = JSON.parse(Buffer.from(mockEnv.fsStorage[tasksFilePath]).toString('utf8'));
    assert.strictEqual(saved.tasks.length, 1);
    assert.strictEqual(saved.tasks[0].label, 'lint');
  });

  it('should find line number in workspace tasks.json', async () => {
    const content = `{\n  "version": "2.0.0",\n  "tasks": [\n    {\n      "label": "my-task"\n    }\n  ]\n}`;
    mockEnv.fsStorage[tasksFilePath] = Buffer.from(content, 'utf8');

    const manager = new TaskConfigManager();
    const line = await manager.findTaskLine('my-task');
    assert.strictEqual(line, 4);
  });

  it('should open task in editor with cursor positioned on the line', async () => {
    const content = `{\n  "version": "2.0.0",\n  "tasks": [\n    {\n      "label": "my-task"\n    }\n  ]\n}`;
    mockEnv.fsStorage[tasksFilePath] = Buffer.from(content, 'utf8');

    const manager = new TaskConfigManager();
    const editor = await manager.openTaskInEditor('my-task');
    assert.ok(editor !== undefined);

    const lastRevealed = mockEnv.getLastRevealedRange();
    assert.ok(lastRevealed !== undefined);
    assert.strictEqual(lastRevealed?.range.start.line, 4);
  });

  it('should not overwrite tasks.json and show error when existing content is invalid JSON', async () => {
    const invalidJson = '{\n  "version": "2.0.0",\n  "tasks": [ INVALID JSON HERE ]\n}';
    mockEnv.fsStorage[tasksFilePath] = Buffer.from(invalidJson, 'utf8');

    const manager = new TaskConfigManager();
    const newTask: TaskConfigDefinition = {
      label: 'new-task',
      type: 'shell',
      command: 'echo 1',
    };

    const writtenUri = await manager.addTaskDefinition(newTask);
    assert.strictEqual(writtenUri, undefined);
    assert.strictEqual(
      Buffer.from(mockEnv.fsStorage[tasksFilePath]).toString('utf8'),
      invalidJson
    );
  });

  it('should open tasks.json and initialize file if missing in openTaskInEditor', async () => {
    delete mockEnv.fsStorage[tasksFilePath];

    const manager = new TaskConfigManager();
    const editor = await manager.openTaskInEditor('nonexistent');
    assert.ok(editor !== undefined);
    assert.ok(mockEnv.fsStorage[tasksFilePath] !== undefined);
  });

  it('should open tasks.json and initialize file if missing', async () => {
    const manager = new TaskConfigManager();
    const editor = await manager.openTasksJson();
    assert.ok(editor !== undefined);
    assert.ok(mockEnv.fsStorage[tasksFilePath] !== undefined);
    const parsed = JSON.parse(Buffer.from(mockEnv.fsStorage[tasksFilePath]).toString('utf8'));
    assert.strictEqual(parsed.version, '2.0.0');
    assert.deepStrictEqual(parsed.tasks, []);
  });
});
