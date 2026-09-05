import * as vscode from 'vscode';
import { TaskManager } from './taskManager';
import { TaskConfigManager } from './taskConfigManager';
import { DebugManager } from './debugManager';

export type TaskTreeItemType = 'category' | 'activeTask' | 'task' | 'empty';

export class TaskTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: TaskTreeItemType,
    public readonly task?: vscode.Task,
    public readonly categoryKey?: 'active' | 'workspace' | 'detected'
  ) {
    super(label, collapsibleState);
  }
}

export class TasksTreeDataProvider implements vscode.TreeDataProvider<TaskTreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeItem | undefined | null | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly taskManager: TaskManager,
    private readonly taskConfigManager: TaskConfigManager,
    private readonly debugManager: DebugManager
  ) {
    this.registerListeners();
  }

  private registerListeners(): void {
    this.disposables.push(
      this.taskManager.onDidChangeActiveTask(() => this.refresh()),
      this.taskManager.onDidChangeRunningState(() => this.refresh()),
      vscode.tasks.onDidStartTask(() => this.refresh()),
      vscode.tasks.onDidEndTask(() => this.refresh()),
      vscode.tasks.onDidStartTaskProcess(() => this.refresh()),
      vscode.tasks.onDidEndTaskProcess(() => this.refresh())
    );
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: TaskTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: TaskTreeItem): Promise<TaskTreeItem[]> {
    if (!element) {
      // Root level: return categories
      return this.getRootCategories();
    }

    if (element.itemType === 'category') {
      return this.getCategoryChildren(element);
    }

    return [];
  }

  private async getRootCategories(): Promise<TaskTreeItem[]> {
    const categories: TaskTreeItem[] = [];

    // 1. Active Task Category
    const activeItem = new TaskTreeItem(
      'Selected Task',
      vscode.TreeItemCollapsibleState.Expanded,
      'category',
      undefined,
      'active'
    );
    activeItem.iconPath = new vscode.ThemeIcon('checklist');
    categories.push(activeItem);

    // 2. Workspace Tasks Category
    const workspaceItem = new TaskTreeItem(
      'Workspace Tasks',
      vscode.TreeItemCollapsibleState.Expanded,
      'category',
      undefined,
      'workspace'
    );
    workspaceItem.iconPath = new vscode.ThemeIcon('folder');
    categories.push(workspaceItem);

    // 3. Detected Tasks Category
    const detectedItem = new TaskTreeItem(
      'Detected Tasks',
      vscode.TreeItemCollapsibleState.Collapsed,
      'category',
      undefined,
      'detected'
    );
    detectedItem.iconPath = new vscode.ThemeIcon('tools');
    categories.push(detectedItem);

    return categories;
  }

  private async getCategoryChildren(element: TaskTreeItem): Promise<TaskTreeItem[]> {
    if (element.categoryKey === 'active') {
      const activeTask = this.taskManager.getActiveTask();
      if (!activeTask) {
        const emptyItem = new TaskTreeItem(
          'No task selected',
          vscode.TreeItemCollapsibleState.None,
          'empty'
        );
        emptyItem.description = 'Click a task below to select';
        emptyItem.iconPath = new vscode.ThemeIcon('info');
        return [emptyItem];
      }

      const isRunning = this.taskManager.isTaskRunning(activeTask);
      const activeNode = new TaskTreeItem(
        activeTask.name,
        vscode.TreeItemCollapsibleState.None,
        'activeTask',
        activeTask
      );
      activeNode.contextValue = isRunning ? 'runningTaskItem' : 'idleTaskItem';
      activeNode.description = isRunning ? '(running)' : '(selected)';
      activeNode.tooltip = `Active Task: ${activeTask.name}${isRunning ? ' (Running)' : ''}`;
      activeNode.iconPath = isRunning
        ? new vscode.ThemeIcon('sync~spin')
        : new vscode.ThemeIcon('pass-filled');
      return [activeNode];
    }

    const allTasks = await this.taskManager.fetchTasks();
    const activeTask = this.taskManager.getActiveTask();

    if (element.categoryKey === 'workspace') {
      const workspaceTasks = allTasks.filter((t) => {
        const src = (t.source || '').toLowerCase();
        return src === 'workspace' || t.scope === vscode.TaskScope.Workspace || typeof t.scope === 'object';
      });

      if (workspaceTasks.length === 0) {
        const emptyItem = new TaskTreeItem(
          'No workspace tasks defined',
          vscode.TreeItemCollapsibleState.None,
          'empty'
        );
        emptyItem.description = 'Click + to add a task in tasks.json';
        emptyItem.iconPath = new vscode.ThemeIcon('info');
        return [emptyItem];
      }

      return workspaceTasks.map((task) => this.createTaskNode(task, activeTask));
    }

    if (element.categoryKey === 'detected') {
      const detectedTasks = allTasks.filter((t) => {
        const src = (t.source || '').toLowerCase();
        return src !== 'workspace' && t.scope !== vscode.TaskScope.Workspace && typeof t.scope !== 'object';
      });

      if (detectedTasks.length === 0) {
        const emptyItem = new TaskTreeItem(
          'No auto-detected tasks',
          vscode.TreeItemCollapsibleState.None,
          'empty'
        );
        emptyItem.iconPath = new vscode.ThemeIcon('info');
        return [emptyItem];
      }

      return detectedTasks.map((task) => this.createTaskNode(task, activeTask));
    }

    return [];
  }

  private createTaskNode(task: vscode.Task, activeTask?: vscode.Task): TaskTreeItem {
    const isSelected = activeTask ? this.taskManager.matchesTask(task, activeTask) : false;
    const isRunning = this.taskManager.isTaskRunning(task);

    const node = new TaskTreeItem(
      task.name,
      vscode.TreeItemCollapsibleState.None,
      'task',
      task
    );

    node.contextValue = isRunning ? 'runningTaskItem' : 'idleTaskItem';

    const descParts: string[] = [];
    if (task.source && task.source.toLowerCase() !== 'workspace') {
      descParts.push(task.source);
    }
    if (isRunning) {
      descParts.push('running');
    } else if (isSelected) {
      descParts.push('selected');
    }
    node.description = descParts.length > 0 ? `(${descParts.join(', ')})` : undefined;

    if (isRunning) {
      node.iconPath = new vscode.ThemeIcon('sync~spin');
    } else if (isSelected) {
      node.iconPath = new vscode.ThemeIcon('check');
    } else {
      node.iconPath = new vscode.ThemeIcon('play-circle');
    }

    // Clicking an item selects it as active task
    node.command = {
      command: 'tasksWidget.selectTreeTask',
      title: 'Select Task',
      arguments: [task],
    };

    node.tooltip = `Task: ${task.name} (${task.source || 'workspace'})`;
    return node;
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this._onDidChangeTreeData.dispose();
  }
}
