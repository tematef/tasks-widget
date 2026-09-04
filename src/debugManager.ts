import * as vscode from 'vscode';
import { DEFAULTS } from './constants';
import { stripJsonComments, stripTrailingCommas } from './taskConfigManager';
import { TaskManager } from './taskManager';

export interface LaunchJsonStructure {
  version?: string;
  configurations?: vscode.DebugConfiguration[];
  compounds?: unknown[];
  [key: string]: unknown;
}

/**
 * Resolves debug configurations in .vscode/launch.json matching workspace tasks,
 * and initiates debug sessions via vscode.debug.startDebugging().
 */
export class DebugManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  private readonly _onDidChangeActiveDebugSession = new vscode.EventEmitter<vscode.DebugSession | undefined>();
  public readonly onDidChangeActiveDebugSession = this._onDidChangeActiveDebugSession.event;

  constructor(private readonly workspaceFolder?: vscode.WorkspaceFolder) {
    this.registerEventListeners();
  }

  /**
   * Resolves the Uri for .vscode/launch.json in the active or specified workspace folder.
   */
  public getLaunchFileUri(folder?: vscode.WorkspaceFolder): vscode.Uri | undefined {
    const targetFolder = folder ?? this.workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
    if (!targetFolder) {
      return undefined;
    }
    return vscode.Uri.joinPath(targetFolder.uri, DEFAULTS.VSCODE_DIR_NAME, DEFAULTS.LAUNCH_FILE_NAME);
  }

  /**
   * Reads and returns all debug configurations from vscode configuration or .vscode/launch.json.
   */
  public async getLaunchConfigurations(folder?: vscode.WorkspaceFolder): Promise<vscode.DebugConfiguration[]> {
    const targetFolder = folder ?? this.workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];

    // 1. Try resolving configurations from VS Code workspace configuration
    if (targetFolder) {
      const workspaceConfig = vscode.workspace.getConfiguration('launch', targetFolder.uri);
      const configs = workspaceConfig.get<vscode.DebugConfiguration[]>('configurations');
      if (Array.isArray(configs) && configs.length > 0) {
        return configs;
      }
    }

    // 2. Fallback to directly reading and parsing .vscode/launch.json
    const uri = this.getLaunchFileUri(targetFolder);
    if (!uri) {
      return [];
    }

    try {
      const fileData = await vscode.workspace.fs.readFile(uri);
      const content = Buffer.from(fileData).toString('utf8').trim();
      if (!content) {
        return [];
      }

      const cleaned = stripTrailingCommas(stripJsonComments(content));
      const parsed = JSON.parse(cleaned) as LaunchJsonStructure;
      if (parsed && Array.isArray(parsed.configurations)) {
        return parsed.configurations;
      }
    } catch {
      // Return empty array if file does not exist or fails to parse
    }

    return [];
  }

  /**
   * Finds a launch configuration matching a given task or task label.
   * Matches by:
   * 1. Exact name match (config.name === taskLabel)
   * 2. Pre-launch task match (config.preLaunchTask === taskLabel)
   * 3. Case-insensitive name match
   * 4. Case-insensitive preLaunchTask match
   * 5. Substring containment
   */
  public async findMatchingDebugConfiguration(
    taskOrLabel: vscode.Task | string,
    folder?: vscode.WorkspaceFolder
  ): Promise<vscode.DebugConfiguration | undefined> {
    const label = typeof taskOrLabel === 'string' ? taskOrLabel : taskOrLabel.name;
    if (!label) {
      return undefined;
    }

    const configs = await this.getLaunchConfigurations(folder);
    if (!configs || configs.length === 0) {
      return undefined;
    }

    const trimmedLabel = label.trim();
    const normalizedLabel = trimmedLabel.toLowerCase();

    // 1. Exact name match
    let match = configs.find((c) => c.name === trimmedLabel);
    if (match) {
      return match;
    }

    // 2. Pre-launch task exact match
    match = configs.find((c) => c.preLaunchTask === trimmedLabel);
    if (match) {
      return match;
    }

    // 3. Case-insensitive name match
    match = configs.find((c) => typeof c.name === 'string' && c.name.trim().toLowerCase() === normalizedLabel);
    if (match) {
      return match;
    }

    // 4. Case-insensitive preLaunchTask match
    match = configs.find(
      (c) => typeof c.preLaunchTask === 'string' && c.preLaunchTask.trim().toLowerCase() === normalizedLabel
    );
    if (match) {
      return match;
    }

    // 5. Substring match
    match = configs.find(
      (c) =>
        typeof c.name === 'string' &&
        c.name.trim().length > 2 &&
        (c.name.toLowerCase().includes(normalizedLabel) ||
          (normalizedLabel.length > 2 && normalizedLabel.includes(c.name.toLowerCase())))
    );
    if (match) {
      return match;
    }

    return undefined;
  }

  /**
   * Initiates debugging for the specified task or task label.
   */
  public async debugTask(
    taskOrLabel: vscode.Task | string,
    folder?: vscode.WorkspaceFolder
  ): Promise<boolean> {
    const targetFolder = folder ?? this.workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
    const label = typeof taskOrLabel === 'string' ? taskOrLabel : taskOrLabel.name;
    const matchingConfig = await this.findMatchingDebugConfiguration(label, targetFolder);

    if (matchingConfig) {
      return vscode.debug.startDebugging(targetFolder, matchingConfig);
    }

    // Fallback: initiate debugging with the task label as configuration name directly
    const started = await vscode.debug.startDebugging(targetFolder, label);
    if (!started) {
      vscode.window.showWarningMessage(`No debug configuration found matching task "${label}".`);
    }
    return started;
  }

  /**
   * Initiates debugging for the active task in TaskManager.
   */
  public async debugSelectedTask(
    taskManager: TaskManager,
    folder?: vscode.WorkspaceFolder
  ): Promise<boolean> {
    let activeTask = taskManager.getActiveTask();
    if (!activeTask) {
      activeTask = await taskManager.restoreActiveTask();
    }

    const label = activeTask?.name ?? taskManager.getActiveTaskLabel();
    if (!label) {
      return false;
    }

    return this.debugTask(activeTask ?? label, folder);
  }

  /**
   * Checks whether a debug session is currently active.
   */
  public isDebugging(): boolean {
    return vscode.debug.activeDebugSession !== undefined;
  }

  /**
   * Returns the currently active debug session.
   */
  public getActiveDebugSession(): vscode.DebugSession | undefined {
    return vscode.debug.activeDebugSession;
  }

  private registerEventListeners(): void {
    this.disposables.push(
      vscode.debug.onDidStartDebugSession((session) => {
        this._onDidChangeActiveDebugSession.fire(session);
      }),
      vscode.debug.onDidTerminateDebugSession(() => {
        this._onDidChangeActiveDebugSession.fire(vscode.debug.activeDebugSession);
      })
    );
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this._onDidChangeActiveDebugSession.dispose();
  }
}
