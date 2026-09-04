import * as vscode from 'vscode';
import { STORAGE_KEYS } from './constants';

export interface TaskExecutionChangeEvent {
  task: vscode.Task;
  execution?: vscode.TaskExecution;
  isRunning: boolean;
}

/**
 * Manages fetching, executing, terminating, and tracking workspace tasks,
 * as well as persisting the active task selection across sessions.
 */
export class TaskManager implements vscode.Disposable {
  private activeTask?: vscode.Task;
  private runningExecutions: Map<string, vscode.TaskExecution> = new Map();
  private readonly activeExecutions = new Set<vscode.TaskExecution>();
  private readonly terminatingExecutions = new Set<vscode.TaskExecution>();
  private disposables: vscode.Disposable[] = [];

  private readonly _onDidChangeActiveTask = new vscode.EventEmitter<vscode.Task | undefined>();
  public readonly onDidChangeActiveTask = this._onDidChangeActiveTask.event;

  private readonly _onDidChangeRunningState = new vscode.EventEmitter<TaskExecutionChangeEvent>();
  public readonly onDidChangeRunningState = this._onDidChangeRunningState.event;

  constructor(private workspaceState?: vscode.Memento) {
    this.registerEventListeners();
    this.syncExistingExecutions();
  }

  /**
   * Sets or updates the Memento instance used to persist active task selection.
   */
  public setWorkspaceState(state: vscode.Memento): void {
    this.workspaceState = state;
  }

  /**
   * Returns the current workspaceState Memento instance.
   */
  public getWorkspaceState(): vscode.Memento | undefined {
    return this.workspaceState;
  }

  /**
   * Fetches tasks available in the workspace from VS Code tasks provider.
   */
  public async fetchTasks(filter?: vscode.TaskFilter): Promise<vscode.Task[]> {
    return vscode.tasks.fetchTasks(filter);
  }

  /**
   * Alias to fetchTasks to retrieve all workspace tasks.
   */
  public async getTasks(): Promise<vscode.Task[]> {
    return this.fetchTasks();
  }

  /**
   * Finds a task by its display name / label.
   */
  public async getTaskByLabel(label: string): Promise<vscode.Task | undefined> {
    const tasks = await this.fetchTasks();
    return tasks.find((t) => t.name === label);
  }

  /**
   * Gets the currently active task in memory.
   */
  public getActiveTask(): vscode.Task | undefined {
    return this.activeTask;
  }

  /**
   * Gets the active task label from the active task or restored from workspace state.
   */
  public getActiveTaskLabel(): string | undefined {
    return this.activeTask?.name ?? this.workspaceState?.get<string>(STORAGE_KEYS.ACTIVE_TASK_LABEL);
  }

  /**
   * Sets the active task and persists its label to workspaceState.
   */
  public async setActiveTask(task: vscode.Task | undefined): Promise<void> {
    this.activeTask = task;
    if (this.workspaceState) {
      await this.workspaceState.update(STORAGE_KEYS.ACTIVE_TASK_LABEL, task ? task.name : undefined);
    }
    this._onDidChangeActiveTask.fire(task);
  }

  /**
   * Resolves a task by label and sets it as the active task.
   */
  public async setActiveTaskByLabel(label: string): Promise<vscode.Task | undefined> {
    const tasks = await this.fetchTasks();
    const task = tasks.find((t) => t.name === label);
    if (task) {
      await this.setActiveTask(task);
      return task;
    }

    // Persist label even if task is not immediately found (e.g. pending discovery)
    this.activeTask = undefined;
    if (this.workspaceState) {
      await this.workspaceState.update(STORAGE_KEYS.ACTIVE_TASK_LABEL, label);
    }
    this._onDidChangeActiveTask.fire(undefined);
    return undefined;
  }

  /**
   * Restores active task from workspaceState if a previously saved task label exists.
   */
  public async restoreActiveTask(): Promise<vscode.Task | undefined> {
    const savedLabel = this.workspaceState?.get<string>(STORAGE_KEYS.ACTIVE_TASK_LABEL);
    if (!savedLabel) {
      return undefined;
    }

    const tasks = await this.fetchTasks();
    const task = tasks.find((t) => t.name === savedLabel);
    if (task) {
      this.activeTask = task;
      this._onDidChangeActiveTask.fire(task);
      return task;
    }

    return undefined;
  }

  /**
   * Helper to check if two tasks match by reference, or by name and scope.
   */
  private matchesTask(a?: vscode.Task, b?: vscode.Task): boolean {
    if (!a || !b) {
      return false;
    }
    if (a === b) {
      return true;
    }
    if (a.name !== b.name) {
      return false;
    }
    if (a.scope !== undefined && b.scope !== undefined) {
      if (a.scope && typeof a.scope === 'object' && b.scope && typeof b.scope === 'object') {
        const folderA = a.scope as vscode.WorkspaceFolder;
        const folderB = b.scope as vscode.WorkspaceFolder;
        if (folderA.uri?.toString() !== folderB.uri?.toString()) {
          return false;
        }
      } else if (a.scope !== b.scope) {
        return false;
      }
    }
    return true;
  }

  /**
   * Checks whether a task (or the active task if omitted) is currently running.
   */
  public isRunning(task?: vscode.Task): boolean {
    const target = task ?? this.activeTask;
    if (!target) {
      return false;
    }

    for (const exec of this.activeExecutions) {
      if (this.matchesTask(exec.task, target) && !this.terminatingExecutions.has(exec)) {
        return true;
      }
    }

    if (vscode.tasks.taskExecutions && Array.isArray(vscode.tasks.taskExecutions)) {
      return vscode.tasks.taskExecutions.some(
        (e) => this.matchesTask(e.task, target) && !this.terminatingExecutions.has(e)
      );
    }

    return false;
  }

  /**
   * Checks if a task is running by task instance or task label.
   */
  public isTaskRunning(taskOrLabel?: vscode.Task | string): boolean {
    if (!taskOrLabel) {
      return this.isRunning();
    }
    if (typeof taskOrLabel === 'string') {
      const exec = this.runningExecutions.get(taskOrLabel);
      if (exec && !this.terminatingExecutions.has(exec)) {
        return true;
      }
      if (vscode.tasks.taskExecutions && Array.isArray(vscode.tasks.taskExecutions)) {
        return vscode.tasks.taskExecutions.some(
          (exec) => exec.task?.name === taskOrLabel && !this.terminatingExecutions.has(exec)
        );
      }
      return false;
    }
    return this.isRunning(taskOrLabel);
  }

  /**
   * Returns whether the currently selected task is executing.
   */
  public isSelectedTaskRunning(): boolean {
    if (this.activeTask) {
      return this.isRunning(this.activeTask);
    }
    const label = this.getActiveTaskLabel();
    if (label) {
      return this.isTaskRunning(label);
    }
    return false;
  }

  /**
   * Executes a task, tracks its execution, and notifies state listeners.
   */
  public async executeTask(task: vscode.Task): Promise<vscode.TaskExecution> {
    const wasRunning = Array.from(this.activeExecutions).some(
      (ex) => this.matchesTask(ex.task, task) && !this.terminatingExecutions.has(ex)
    );
    const execution = await vscode.tasks.executeTask(task);
    const alreadyTracked = this.activeExecutions.has(execution);
    this.activeExecutions.add(execution);
    this.runningExecutions.set(task.name, execution);
    if (!wasRunning && !alreadyTracked) {
      this._onDidChangeRunningState.fire({
        task,
        execution,
        isRunning: true,
      });
    }
    return execution;
  }

  /**
   * Executes the active task. If no task is active, attempts to restore from workspaceState.
   */
  public async executeSelectedTask(): Promise<vscode.TaskExecution | undefined> {
    if (!this.activeTask) {
      await this.restoreActiveTask();
    }

    if (!this.activeTask) {
      const label = this.getActiveTaskLabel();
      if (label) {
        const task = await this.getTaskByLabel(label);
        if (task) {
          this.activeTask = task;
        }
      }
    }

    if (!this.activeTask) {
      return undefined;
    }

    return this.executeTask(this.activeTask);
  }

  /**
   * Stops/terminates a running task execution.
   */
  public async stopTask(task?: vscode.Task): Promise<boolean> {
    const target = task ?? this.activeTask;
    if (!target) {
      return false;
    }

    let execution: vscode.TaskExecution | undefined;
    for (const exec of this.activeExecutions) {
      if (this.matchesTask(exec.task, target) && !this.terminatingExecutions.has(exec)) {
        execution = exec;
        break;
      }
    }

    if (
      !execution &&
      vscode.tasks.taskExecutions &&
      Array.isArray(vscode.tasks.taskExecutions)
    ) {
      execution = vscode.tasks.taskExecutions.find(
        (exec) => this.matchesTask(exec.task, target) && !this.terminatingExecutions.has(exec)
      );
    }

    if (execution) {
      this.terminatingExecutions.add(execution);
      this.activeExecutions.delete(execution);
      execution.terminate();

      const remainingForName = Array.from(this.activeExecutions).find(
        (ex) => ex.task?.name === target.name && !this.terminatingExecutions.has(ex)
      );
      if (remainingForName) {
        this.runningExecutions.set(target.name, remainingForName);
      } else {
        this.runningExecutions.delete(target.name);
      }

      const remainingForTarget = Array.from(this.activeExecutions).find(
        (ex) => this.matchesTask(ex.task, target) && !this.terminatingExecutions.has(ex)
      );
      if (!remainingForTarget) {
        this._onDidChangeRunningState.fire({
          task: target,
          execution,
          isRunning: false,
        });
      }
      return true;
    }

    return false;
  }

  /**
   * Stops the currently active task if running.
   */
  public async stopSelectedTask(): Promise<boolean> {
    if (this.activeTask) {
      return this.stopTask(this.activeTask);
    }
    const label = this.getActiveTaskLabel();
    if (label) {
      let execution = this.runningExecutions.get(label);
      if ((!execution || this.terminatingExecutions.has(execution)) && vscode.tasks.taskExecutions && Array.isArray(vscode.tasks.taskExecutions)) {
        execution = vscode.tasks.taskExecutions.find(
          (exec) => exec.task?.name === label && !this.terminatingExecutions.has(exec)
        );
      }
      if (execution) {
        this.terminatingExecutions.add(execution);
        this.activeExecutions.delete(execution);
        execution.terminate();

        const remaining = Array.from(this.activeExecutions).find(
          (ex) => ex.task?.name === label && !this.terminatingExecutions.has(ex)
        );
        if (remaining) {
          this.runningExecutions.set(label, remaining);
        } else {
          this.runningExecutions.delete(label);
          this._onDidChangeRunningState.fire({
            task: execution.task,
            execution,
            isRunning: false,
          });
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the running TaskExecution for a given task or the active task.
   */
  public getRunningExecution(task?: vscode.Task): vscode.TaskExecution | undefined {
    const target = task ?? this.activeTask;
    if (!target) {
      return undefined;
    }
    for (const exec of this.activeExecutions) {
      if (this.matchesTask(exec.task, target) && !this.terminatingExecutions.has(exec)) {
        return exec;
      }
    }
    if (vscode.tasks.taskExecutions && Array.isArray(vscode.tasks.taskExecutions)) {
      return vscode.tasks.taskExecutions.find(
        (exec) => this.matchesTask(exec.task, target) && !this.terminatingExecutions.has(exec)
      );
    }
    return undefined;
  }

  /**
   * Returns an immutable view of all tracked running task executions.
   */
  public getRunningExecutions(): ReadonlyMap<string, vscode.TaskExecution> {
    return this.runningExecutions;
  }

  private syncExistingExecutions(): void {
    if (vscode.tasks.taskExecutions && Array.isArray(vscode.tasks.taskExecutions)) {
      for (const exec of vscode.tasks.taskExecutions) {
        if (exec.task?.name) {
          this.activeExecutions.add(exec);
          this.runningExecutions.set(exec.task.name, exec);
        }
      }
    }
  }

  private registerEventListeners(): void {
    const handleStart = (e: vscode.TaskStartEvent | vscode.TaskProcessStartEvent) => {
      if (e?.execution?.task?.name) {
        const alreadyTracked = this.activeExecutions.has(e.execution);
        const wasRunning = Array.from(this.activeExecutions).some(
          (ex) => this.matchesTask(ex.task, e.execution.task) && !this.terminatingExecutions.has(ex)
        );
        this.activeExecutions.add(e.execution);
        this.runningExecutions.set(e.execution.task.name, e.execution);
        if (!wasRunning && !alreadyTracked) {
          this._onDidChangeRunningState.fire({
            task: e.execution.task,
            execution: e.execution,
            isRunning: true,
          });
        }
      }
    };

    const handleProcessEnd = (e: vscode.TaskProcessEndEvent) => {
      if (e?.execution?.task?.name) {
        this.activeExecutions.delete(e.execution);
        // Mark as terminating so any concurrent/pending check in vscode.tasks.taskExecutions
        // does not consider this execution running before onDidEndTask fires
        this.terminatingExecutions.add(e.execution);

        const remaining = Array.from(this.activeExecutions).find(
          (ex) => ex.task?.name === e.execution.task.name && !this.terminatingExecutions.has(ex)
        );

        if (remaining) {
          this.runningExecutions.set(e.execution.task.name, remaining);
        } else {
          const wasRunning = this.runningExecutions.has(e.execution.task.name);
          this.runningExecutions.delete(e.execution.task.name);
          if (wasRunning) {
            this._onDidChangeRunningState.fire({
              task: e.execution.task,
              execution: e.execution,
              isRunning: false,
            });
          }
        }
      }
    };

    const handleTaskEnd = (e: vscode.TaskEndEvent) => {
      if (e?.execution?.task?.name) {
        this.activeExecutions.delete(e.execution);
        this.terminatingExecutions.delete(e.execution);

        const remaining = Array.from(this.activeExecutions).find(
          (ex) => ex.task?.name === e.execution.task.name && !this.terminatingExecutions.has(ex)
        );

        if (remaining) {
          this.runningExecutions.set(e.execution.task.name, remaining);
        } else {
          const wasRunning = this.runningExecutions.has(e.execution.task.name);
          this.runningExecutions.delete(e.execution.task.name);
          if (wasRunning) {
            this._onDidChangeRunningState.fire({
              task: e.execution.task,
              execution: e.execution,
              isRunning: false,
            });
          }
        }
      }
    };

    this.disposables.push(
      vscode.tasks.onDidStartTask(handleStart),
      vscode.tasks.onDidStartTaskProcess(handleStart),
      vscode.tasks.onDidEndTask(handleTaskEnd),
      vscode.tasks.onDidEndTaskProcess(handleProcessEnd)
    );
  }

  /**
   * Disposes all event emitters and subscriptions.
   */
  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this._onDidChangeActiveTask.dispose();
    this._onDidChangeRunningState.dispose();
    this.runningExecutions.clear();
    this.activeExecutions.clear();
    this.terminatingExecutions.clear();
  }
}
