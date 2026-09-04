import * as assert from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { setupVscodeMock, MockTask, MockTaskScope, MockMemento } from './mockVscode';

const mockEnv = setupVscodeMock();

import { TaskManager } from '../taskManager';
import { TaskConfigManager } from '../taskConfigManager';
import { QuickPickController, TaskQuickPickItem } from '../quickPickController';

describe('QuickPickController', () => {
  let memento: MockMemento;
  let taskManager: TaskManager;
  let taskConfigManager: TaskConfigManager;
  let controller: QuickPickController;

  beforeEach(async () => {
    mockEnv.openedDocuments.length = 0;
    mockEnv.mockWindow.createdQuickPicks.length = 0;
    mockEnv.mockWindow.informationMessages.length = 0;
    mockEnv.mockWindow.setInputBoxHandler(undefined);
    mockEnv.mockWindow.setQuickPickHandler(undefined);

    await mockEnv.mockFs.writeFile(
      mockEnv.vscodeModule.Uri.file('/mock/workspace/.vscode/tasks.json') as any,
      Buffer.from(
        JSON.stringify(
          {
            version: '2.0.0',
            tasks: [
              {
                label: 'build-client',
                type: 'shell',
                command: 'npm run build',
              },
            ],
          },
          null,
          2
        ),
        'utf8'
      )
    );

    memento = new MockMemento();
    taskManager = new TaskManager(memento);
    taskConfigManager = new TaskConfigManager(mockEnv.mockWorkspace.workspaceFolders[0] as any);
    controller = new QuickPickController(taskManager, taskConfigManager);
  });

  describe('buildQuickPickItems', () => {
    it('should categorize workspace and detected tasks with separators and actions', () => {
      const task1 = new MockTask(
        { command: 'npm run build' },
        MockTaskScope.Workspace,
        'build-client',
        'Workspace'
      );
      const task2 = new MockTask(
        { command: 'npm test' },
        MockTaskScope.Workspace,
        'test-unit',
        'npm'
      );

      const items = controller.buildQuickPickItems([task1 as any, task2 as any]);

      // Should have Workspace Tasks separator, task item, Detected Tasks separator, task item, Actions separator, action items
      const separators = items.filter((item) => (item as any).kind === -1);
      assert.strictEqual(separators.length, 3);
      assert.strictEqual(separators[0].label, 'Workspace Tasks');
      assert.strictEqual(separators[1].label, 'Detected Tasks');
      assert.strictEqual(separators[2].label, 'Actions');

      const taskItems = items.filter((item) => (item as TaskQuickPickItem).task);
      assert.strictEqual(taskItems.length, 2);

      // Verify item buttons
      for (const item of taskItems) {
        assert.ok(item.buttons);
        assert.strictEqual(item.buttons.length, 1);
        assert.strictEqual((item.buttons[0] as any).tooltip, 'Edit task in tasks.json');
      }

      // Verify dedicated action items
      const addAction = items.find((item) => (item as TaskQuickPickItem).action === 'add');
      const configureAction = items.find((item) => (item as TaskQuickPickItem).action === 'configure');

      assert.ok(addAction);
      assert.ok(addAction.label.includes('Add New Task'));
      assert.ok(configureAction);
      assert.ok(configureAction.label.includes('Edit Tasks'));
    });

    it('should mark active task with checkmark and active badge', async () => {
      const task1 = new MockTask(
        { command: 'npm run build' },
        MockTaskScope.Workspace,
        'build-client',
        'Workspace'
      );
      await taskManager.setActiveTask(task1 as any);

      const items = controller.buildQuickPickItems([task1 as any]);
      const taskItem = items.find((i) => i.task?.name === 'build-client');

      assert.ok(taskItem);
      assert.ok(taskItem.label.includes('$(check)'));
      assert.strictEqual(taskItem.picked, true);
      assert.ok(taskItem.description?.includes('Active'));
    });

    it('should indicate running state in description when task is executing', async () => {
      const task1 = new MockTask(
        { command: 'npm run build' },
        MockTaskScope.Workspace,
        'build-client',
        'Workspace'
      );
      mockEnv.mockTasks.setTasks([task1]);
      await taskManager.executeTask(task1 as any);

      const items = controller.buildQuickPickItems([task1 as any]);
      const taskItem = items.find((i) => i.task?.name === 'build-client');

      assert.ok(taskItem);
      assert.ok(taskItem.description?.includes('Running'));
    });

    it('should show No Tasks Found separator when task list is empty', () => {
      const items = controller.buildQuickPickItems([]);
      const noTasksSeparator = items.find((item) => item.label === 'No Tasks Found');
      assert.ok(noTasksSeparator);
    });

    it('should display process path in detail for ProcessExecution tasks', () => {
      const task = new MockTask(
        { type: 'process' },
        MockTaskScope.Workspace,
        'custom-process',
        'workspace',
        { process: '/usr/local/bin/my-tool' } as any
      );
      const items = controller.buildQuickPickItems([task as any]);
      const taskItem = items.find((i) => i.task?.name === 'custom-process');
      assert.ok(taskItem);
      assert.strictEqual(taskItem.detail, '/usr/local/bin/my-tool');
    });

    it('should display string value in detail when command is a ShellQuotedString object', () => {
      const task = new MockTask(
        { type: 'shell' },
        MockTaskScope.Workspace,
        'quoted-task',
        'workspace',
        { command: { value: 'echo "hello"', quoting: 1 } } as any
      );
      const items = controller.buildQuickPickItems([task as any]);
      const taskItem = items.find((i) => i.task?.name === 'quoted-task');
      assert.ok(taskItem);
      assert.strictEqual(taskItem.detail, 'echo "hello"');
    });
  });

  describe('showTaskSelector', () => {
    it('should set title, placeholder, and title bar action buttons', async () => {
      const task1 = new MockTask(
        { command: 'npm run build' },
        MockTaskScope.Workspace,
        'build-client',
        'Workspace'
      );
      mockEnv.mockTasks.setTasks([task1]);

      const promise = controller.showTaskSelector();
      await new Promise((r) => setImmediate(r));
      const qp = (controller.getActiveQuickPick() || mockEnv.mockWindow.createdQuickPicks[0]) as any;

      assert.ok(qp);
      assert.strictEqual(qp.title, 'Tasks');
      assert.strictEqual(qp.placeholder, 'Select a task to run or configure');
      assert.strictEqual(qp.buttons.length, 2);
      assert.strictEqual((qp.buttons[0] as any).tooltip, 'Add New Task');
      assert.strictEqual((qp.buttons[1] as any).tooltip, 'Configure tasks.json');

      qp.hide();
      const result = await promise;
      assert.strictEqual(result, undefined);
    });

    it('should select task and set it as active when an item is accepted', async () => {
      const task1 = new MockTask(
        { command: 'npm run build' },
        MockTaskScope.Workspace,
        'build-client',
        'Workspace'
      );
      mockEnv.mockTasks.setTasks([task1]);

      const promise = controller.showTaskSelector();
      await new Promise((r) => setImmediate(r));
      const qp = (controller.getActiveQuickPick() || mockEnv.mockWindow.createdQuickPicks[0]) as any;

      const item = qp.items.find((i: any) => i.task?.name === 'build-client') as any;
      assert.ok(item);
      (qp as any).selectedItems = [item];
      qp.triggerAccept();

      const result = await promise;
      assert.strictEqual(result?.name, 'build-client');
      assert.strictEqual(taskManager.getActiveTask()?.name, 'build-client');
    });

    it('should trigger task editing when item edit button is clicked', async () => {
      const task1 = new MockTask(
        { command: 'npm run build' },
        MockTaskScope.Workspace,
        'build-client',
        'Workspace'
      );
      mockEnv.mockTasks.setTasks([task1]);

      const promise = controller.showTaskSelector();
      await new Promise((r) => setImmediate(r));
      const qp = (controller.getActiveQuickPick() || mockEnv.mockWindow.createdQuickPicks[0]) as any;

      const item = qp.items.find((i: any) => i.task?.name === 'build-client') as any;
      assert.ok(item);
      qp.triggerItemButton(item.buttons[0], item);

      await promise;
      assert.strictEqual(mockEnv.openedDocuments.length, 1);
      assert.ok(mockEnv.openedDocuments[0].uri.fsPath.endsWith('tasks.json'));
    });

    it('should trigger addNewTaskFlow when title add button is clicked', async () => {
      mockEnv.mockTasks.setTasks([]);

      // Provide responses for Add Task prompts: label, command, type, group
      const inputAnswers = ['compile-ts', 'tsc -p ./'];
      mockEnv.mockWindow.setInputBoxHandler(() => inputAnswers.shift());

      const pickAnswers = [{ label: 'shell' }, { label: 'build' }];
      mockEnv.mockWindow.setQuickPickHandler(() => pickAnswers.shift());

      const promise = controller.showTaskSelector();
      await new Promise((r) => setImmediate(r));
      const qp = (controller.getActiveQuickPick() || mockEnv.mockWindow.createdQuickPicks[0]) as any;

      qp.triggerButton(qp.buttons[0]);
      await promise;

      const fileData = await mockEnv.mockFs.readFile(
        taskConfigManager.getTasksFileUri() as any
      );
      const text = Buffer.from(fileData).toString('utf8');
      assert.ok(text.includes('compile-ts'));
      assert.ok(text.includes('tsc -p ./'));
      assert.strictEqual(taskManager.getActiveTaskLabel(), 'compile-ts');
    });

    it('should trigger configureTasks when title gear button is clicked', async () => {
      mockEnv.mockTasks.setTasks([]);

      const promise = controller.showTaskSelector();
      await new Promise((r) => setImmediate(r));
      const qp = (controller.getActiveQuickPick() || mockEnv.mockWindow.createdQuickPicks[0]) as any;

      qp.triggerButton(qp.buttons[1]);
      await promise;

      assert.strictEqual(mockEnv.openedDocuments.length, 1);
      assert.ok(mockEnv.openedDocuments[0].uri.fsPath.endsWith('tasks.json'));
    });

    it('should trigger addNewTaskFlow when Add New Task menu entry is accepted', async () => {
      mockEnv.mockTasks.setTasks([]);

      const inputAnswers = ['deploy-app', 'npm run deploy'];
      mockEnv.mockWindow.setInputBoxHandler(() => inputAnswers.shift());
      const pickAnswers = [{ label: 'shell' }, { label: 'none' }];
      mockEnv.mockWindow.setQuickPickHandler(() => pickAnswers.shift());

      const promise = controller.showTaskSelector();
      await new Promise((r) => setImmediate(r));
      const qp = (controller.getActiveQuickPick() || mockEnv.mockWindow.createdQuickPicks[0]) as any;

      const addAction = qp.items.find((i: any) => i.action === 'add') as any;
      assert.ok(addAction);
      (qp as any).selectedItems = [addAction];
      qp.triggerAccept();

      await promise;

      const fileData = await mockEnv.mockFs.readFile(
        taskConfigManager.getTasksFileUri() as any
      );
      const text = Buffer.from(fileData).toString('utf8');
      assert.ok(text.includes('deploy-app'));
      assert.strictEqual(taskManager.getActiveTaskLabel(), 'deploy-app');
    });

    it('should trigger configureTasks when Edit Tasks menu entry is accepted', async () => {
      mockEnv.mockTasks.setTasks([]);

      const promise = controller.showTaskSelector();
      await new Promise((r) => setImmediate(r));
      const qp = (controller.getActiveQuickPick() || mockEnv.mockWindow.createdQuickPicks[0]) as any;

      const configAction = qp.items.find((i: any) => i.action === 'configure') as any;
      assert.ok(configAction);
      (qp as any).selectedItems = [configAction];
      qp.triggerAccept();

      await promise;

      assert.strictEqual(mockEnv.openedDocuments.length, 1);
      assert.ok(mockEnv.openedDocuments[0].uri.fsPath.endsWith('tasks.json'));
    });
  });

  describe('addNewTaskFlow', () => {
    it('should successfully prompt for all fields and insert into tasks.json with group', async () => {
      const inputs = ['unit-tests', 'npm run test:unit'];
      mockEnv.mockWindow.setInputBoxHandler(() => inputs.shift());

      const picks = [{ label: 'shell' }, { label: 'test' }];
      mockEnv.mockWindow.setQuickPickHandler(() => picks.shift());

      const result = await controller.addNewTaskFlow();

      assert.ok(result);
      assert.strictEqual(result.label, 'unit-tests');
      assert.strictEqual(result.command, 'npm run test:unit');
      assert.strictEqual(result.type, 'shell');
      assert.deepStrictEqual(result.group, { kind: 'test', isDefault: true });

      // Verify tasks.json content
      const fileData = await mockEnv.mockFs.readFile(
        taskConfigManager.getTasksFileUri() as any
      );
      const content = Buffer.from(fileData).toString('utf8');
      assert.ok(content.includes('"label": "unit-tests"'));
      assert.ok(content.includes('"command": "npm run test:unit"'));

      // Verify active task was updated
      assert.strictEqual(taskManager.getActiveTaskLabel(), 'unit-tests');

      // Verify confirmation notification
      assert.ok(mockEnv.mockWindow.informationMessages.some((msg) => msg.includes('unit-tests')));
    });

    it('should cancel and return undefined when task name is aborted', async () => {
      mockEnv.mockWindow.setInputBoxHandler(() => undefined);

      const result = await controller.addNewTaskFlow();
      assert.strictEqual(result, undefined);
    });

    it('should cancel and return undefined when command is aborted', async () => {
      const inputs = ['my-task', undefined];
      mockEnv.mockWindow.setInputBoxHandler(() => inputs.shift());

      const result = await controller.addNewTaskFlow();
      assert.strictEqual(result, undefined);
    });

    it('should cancel and return undefined when type selection is aborted', async () => {
      const inputs = ['my-task', 'echo 1'];
      mockEnv.mockWindow.setInputBoxHandler(() => inputs.shift());
      mockEnv.mockWindow.setQuickPickHandler(() => undefined);

      const result = await controller.addNewTaskFlow();
      assert.strictEqual(result, undefined);
    });

    it('should cancel and return undefined when group selection is aborted', async () => {
      const inputs = ['my-task', 'echo 1'];
      mockEnv.mockWindow.setInputBoxHandler(() => inputs.shift());
      let callCount = 0;
      mockEnv.mockWindow.setQuickPickHandler(() => {
        callCount++;
        if (callCount === 1) {
          return { label: 'shell' };
        }
        return undefined;
      });

      const result = await controller.addNewTaskFlow();
      assert.strictEqual(result, undefined);
    });

    it('should reject empty or whitespace-only task name in validateInput', async () => {
      const inputs = ['   ', 'valid-task', 'npm test'];
      mockEnv.mockWindow.setInputBoxHandler(() => inputs.shift());
      const picks = [{ label: 'shell' }, { label: 'none' }];
      mockEnv.mockWindow.setQuickPickHandler(() => picks.shift());

      // With our mock showInputBox validating inputs, the first '   ' will fail validation and return undefined
      const result = await controller.addNewTaskFlow();
      assert.strictEqual(result, undefined);
    });

    it('should reject empty or whitespace-only command in validateInput', async () => {
      const inputs = ['valid-task', '   '];
      mockEnv.mockWindow.setInputBoxHandler(() => inputs.shift());
      const picks = [{ label: 'shell' }, { label: 'none' }];
      mockEnv.mockWindow.setQuickPickHandler(() => picks.shift());

      const result = await controller.addNewTaskFlow();
      assert.strictEqual(result, undefined);
    });

    it('should safely handle existing tasks in tasks.json that lack a label property', async () => {
      const jsonWithoutLabels = JSON.stringify({
        version: '2.0.0',
        tasks: [
          { type: 'shell', command: 'echo hello' },
          { taskName: 'legacy-name', type: 'shell', command: 'echo legacy' },
        ],
      });
      mockEnv.fsStorage[taskConfigManager.getTasksFileUri()!.fsPath] = Buffer.from(
        jsonWithoutLabels,
        'utf8'
      );

      const inputs = ['safe-task', 'echo ok'];
      mockEnv.mockWindow.setInputBoxHandler(() => inputs.shift());
      const picks = [{ label: 'shell' }, { label: 'none' }];
      mockEnv.mockWindow.setQuickPickHandler(() => picks.shift());

      const result = await controller.addNewTaskFlow();
      assert.ok(result);
      assert.strictEqual(result.label, 'safe-task');
    });
  });

  describe('editTask and configureTasks', () => {
    it('should open task in editor by specified label', async () => {
      const editor = await controller.editTask('build-client');
      assert.ok(editor);
      assert.strictEqual(mockEnv.openedDocuments.length, 1);
    });

    it('should open active task in editor when no label specified', async () => {
      await taskManager.setActiveTaskByLabel('build-client');
      const editor = await controller.editTask();
      assert.ok(editor);
      assert.strictEqual(mockEnv.openedDocuments.length, 1);
    });

    it('should open tasks.json directly via configureTasks', async () => {
      const editor = await controller.configureTasks();
      assert.ok(editor);
      assert.strictEqual(mockEnv.openedDocuments.length, 1);
    });
  });

  describe('dispose', () => {
    it('should dispose any active QuickPick instance', async () => {
      mockEnv.mockTasks.setTasks([]);
      controller.showTaskSelector();
      await new Promise((r) => setImmediate(r));
      const qp = (controller.getActiveQuickPick() || mockEnv.mockWindow.createdQuickPicks[0]) as any;
      assert.ok(qp);
      assert.strictEqual(qp.isDisposed, false);

      controller.dispose();
      assert.strictEqual(qp.isDisposed, true);
    });
  });
});
