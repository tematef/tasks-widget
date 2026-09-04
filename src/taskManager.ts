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
   * Checks whether a task (or the active task if omitted) is currently running.
   */
  public isRunning(task?: vscode.Task): boolean {
    const target = task ?? this.activeTask;
    if (!target) {
      return false;
    }

    if (this.runningExecutions.has(target.name)) {
      return true;
    }

    if (vscode.tasks.taskExecutions && Array.isArray(vscode.tasks.taskExecutions)) {
      return vscode.tasks.taskExecutions.some((exec) => exec.task?.name === target.name);
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
      if (this.runningExecutions.has(taskOrLabel)) {
        return true;
      }
      if (vscode.tasks.taskExecutions && Array.isArray(vscode.tasks.taskExecutions)) {
        return vscode.tasks.taskExecutions.some((exec) => exec.task?.name === taskOrLabel);
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
    const execution = await vscode.tasks.executeTask(task);
    if (!this.runningExecutions.has(task.name)) {
      this.runningExecutions.set(task.name, execution);
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

    let execution = this.runningExecutions.get(target.name);
    if (!execution && vscode.tasks.taskExecutions && Array.isArray(vscode.tasks.taskExecutions)) {
      execution = vscode.tasks.taskExecutions.find((exec) => exec.task?.name === target.name);
    }

    if (execution) {
      execution.terminate();
      this.runningExecutions.delete(target.name);
      this._onDidChangeRunningState.fire({
        task: target,
        execution,
        isRunning: false,
      });
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
      if (!execution && vscode.tasks.taskExecutions && Array.isArray(vscode.tasks.taskExecutions)) {
        execution = vscode.tasks.taskExecutions.find((exec) => exec.task?.name === label);
      }
      if (execution) {
        execution.terminate();
        this.runningExecutions.delete(label);
        this._onDidChangeRunningState.fire({
          task: execution.task,
          execution,
          isRunning: false,
        });
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

    return (
      this.runningExecutions.get(target.name) ??
      vscode.tasks.taskExecutions?.find((exec) => exec.task?.name === target.name)
    );
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
          this.runningExecutions.set(exec.task.name, exec);
        }
      }
    }
  }

  private registerEventListeners(): void {
    this.disposables.push(
      vscode.tasks.onDidStartTask((e) => {
        if (e?.execution?.task?.name) {
          const wasRunning = this.runningExecutions.has(e.execution.task.name);
          this.runningExecutions.set(e.execution.task.name, e.execution);
          if (!wasRunning) {
            this._onDidChangeRunningState.fire({
              task: e.execution.task,
              execution: e.execution,
              isRunning: true,
            });
          }
        }
      }),
      vscode.tasks.onDidStartTaskProcess((e) => {
        if (e?.execution?.task?.name) {
          const wasRunning = this.runningExecutions.has(e.execution.task.name);
          this.runningExecutions.set(e.execution.task.name, e.execution);
          if (!wasRunning) {
            this._onDidChangeRunningState.fire({
              task: e.execution.task,
              execution: e.execution,
              isRunning: true,
            });
          }
        }
      }),
      vscode.tasks.onDidEndTask((e) => {
        if (e?.execution?.task?.name && this.runningExecutions.has(e.execution.task.name)) {
          this.runningExecutions.delete(e.execution.task.name);
          this._onDidChangeRunningState.fire({
            task: e.execution.task,
            execution: e.execution,
            isRunning: false,
          });
        }
      }),
      vscode.tasks.onDidEndTaskProcess((e) => {
        if (e?.execution?.task?.name && this.runningExecutions.has(e.execution.task.name)) {
          this.runningExecutions.delete(e.execution.task.name);
          this._onDidChangeRunningState.fire({
            task: e.execution.task,
            execution: e.execution,
            isRunning: false,
          });
        }
      })
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
  }
}
