import * as vscode from 'vscode';
import { modify, applyEdits, parse as parseJsonc } from 'jsonc-parser';
import { DEFAULTS } from './constants';

export interface TaskConfigDefinition {
  label: string;
  type?: string;
  command?: string;
  args?: string[];
  group?: string | { kind?: string; isDefault?: boolean };
  problemMatcher?: string[] | string;
  presentation?: {
    reveal?: string;
    panel?: string;
    focus?: boolean;
    clear?: boolean;
    [key: string]: unknown;
  };
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    shell?: {
      executable?: string;
      args?: string[];
    };
    [key: string]: unknown;
  };
  dependsOn?: string | string[];
  [key: string]: unknown;
}

export interface TasksJsonStructure {
  version: string;
  tasks?: TaskConfigDefinition[];
  inputs?: unknown[];
  [key: string]: unknown;
}

/**
 * Escapes regex special characters in a string.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips comments from JSONC string while preserving string literals.
 */
export function stripJsonComments(jsonString: string): string {
  return jsonString.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")|(\/\*[\s\S]*?\*\/|\/\/[^\r\n]*)/g,
    (_match, str) => (str ? str : '')
  );
}

/**
 * Removes trailing commas before closing braces/brackets to safely parse relaxed JSON,
 * while preserving string literal contents.
 */
export function stripTrailingCommas(jsonString: string): string {
  return jsonString.replace(
    /(?:"(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")|,(?=\s*[\]}])/g,
    (match) => (match.startsWith('"') ? match : '')
  );
}

/**
 * Parses tasks.json content, handling comments and defaults.
 * If strict is true and parsing fails on non-empty content, throws an Error.
 */
export function parseTasksJson(content: string, strict = false): TasksJsonStructure {
  const trimmed = content.trim();
  if (!trimmed) {
    return {
      version: DEFAULTS.TASKS_VERSION,
      tasks: [],
    };
  }

  const cleaned = stripTrailingCommas(stripJsonComments(trimmed));
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null) {
      if (!parsed.version) {
        parsed.version = DEFAULTS.TASKS_VERSION;
      }
      if (!Array.isArray(parsed.tasks)) {
        parsed.tasks = [];
      }
      return parsed as TasksJsonStructure;
    }
  } catch (err) {
    if (strict) {
      throw err;
    }
  }

  return {
    version: DEFAULTS.TASKS_VERSION,
    tasks: [],
  };
}

/**
 * Serializes TasksJsonStructure into formatted JSON string with 2-space indentation.
 */
export function formatTasksJson(structure: TasksJsonStructure): string {
  return JSON.stringify(structure, null, 2) + '\n';
}

/**
 * Inserts a new task definition into raw tasks.json content or updates an existing one with matching label.
 */
export function insertOrUpdateTaskInJson(jsonContent: string, task: TaskConfigDefinition): string {
  const trimmed = jsonContent.trim();
  if (!trimmed) {
    return formatTasksJson({
      version: DEFAULTS.TASKS_VERSION,
      tasks: [task],
    });
  }

  // Strictly validate that the existing content is valid JSON/JSONC
  parseTasksJson(jsonContent, true);

  const parsed = parseJsonc(jsonContent);
  if (!parsed || typeof parsed !== 'object') {
    return formatTasksJson({
      version: DEFAULTS.TASKS_VERSION,
      tasks: [task],
    });
  }

  const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const existingIndex = tasks.findIndex(
    (t: any) =>
      t &&
      typeof t.label === 'string' &&
      typeof task.label === 'string' &&
      t.label.toLowerCase() === task.label.toLowerCase()
  );

  const editPath = existingIndex >= 0 ? ['tasks', existingIndex] : Array.isArray(parsed.tasks) ? ['tasks', -1] : ['tasks'];
  const editVal = Array.isArray(parsed.tasks) || existingIndex >= 0 ? task : [task];

  const edits = modify(jsonContent, editPath, editVal, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
    },
  });

  return applyEdits(jsonContent, edits);
}

/**
 * Finds the 0-indexed line number in content where a task is defined.
 * Returns -1 if not found.
 */
export function findTaskLineInContent(content: string, taskLabel: string): number {
  if (!content || !taskLabel) {
    return -1;
  }

  const lines = content.split(/\r?\n/);
  const escaped = escapeRegExp(taskLabel);
  const labelRegex = new RegExp(`"label"\\s*:\\s*"${escaped}"`);
  const legacyTaskNameRegex = new RegExp(`"taskName"\\s*:\\s*"${escaped}"`);

  for (let i = 0; i < lines.length; i++) {
    if (labelRegex.test(lines[i])) {
      return i;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (legacyTaskNameRegex.test(lines[i])) {
      return i;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`"${taskLabel}"`)) {
      return i;
    }
  }

  return -1;
}

/**
 * Finds the 0-indexed position (line and character) in content where the task label value begins.
 */
export function findTaskPositionInContent(
  content: string,
  taskLabel: string
): { line: number; character: number } | undefined {
  const line = findTaskLineInContent(content, taskLabel);
  if (line === -1) {
    return undefined;
  }

  const lines = content.split(/\r?\n/);
  const lineText = lines[line];
  const charIndex = lineText.indexOf(taskLabel);

  return {
    line,
    character: charIndex >= 0 ? charIndex : 0,
  };
}

/**
 * Manager class to handle workspace .vscode/tasks.json operations.
 */
export class TaskConfigManager {
  constructor(private readonly workspaceFolder?: vscode.WorkspaceFolder) {}

  /**
   * Resolves the Uri for .vscode/tasks.json in the active or specified workspace folder.
   */
  public getTasksFileUri(folder?: vscode.WorkspaceFolder): vscode.Uri | undefined {
    const targetFolder = folder ?? this.workspaceFolder ?? vscode.workspace.workspaceFolders?.[0];
    if (!targetFolder) {
      return undefined;
    }
    return vscode.Uri.joinPath(targetFolder.uri, DEFAULTS.VSCODE_DIR_NAME, DEFAULTS.TASKS_FILE_NAME);
  }

  /**
   * Reads and parses .vscode/tasks.json. Returns undefined if the file cannot be read.
   */
  public async readTasksJson(
    folder?: vscode.WorkspaceFolder
  ): Promise<{ content: string; parsed: TasksJsonStructure } | undefined> {
    const uri = this.getTasksFileUri(folder);
    if (!uri) {
      return undefined;
    }

    let fileData: Uint8Array;
    try {
      fileData = await vscode.workspace.fs.readFile(uri);
    } catch (err: any) {
      if (
        err?.code === 'FileNotFound' ||
        err?.code === 'ENOENT' ||
        err?.name === 'EntryNotFound (FileSystemError)'
      ) {
        return undefined;
      }
      vscode.window.showErrorMessage(`Failed to read tasks.json: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }

    const content = Buffer.from(fileData).toString('utf8');
    const parsed = parseTasksJson(content);
    return { content, parsed };
  }

  /**
   * Writes content to .vscode/tasks.json, creating parent directory if necessary.
   */
  public async writeTasksJson(content: string, folder?: vscode.WorkspaceFolder): Promise<vscode.Uri | undefined> {
    const uri = this.getTasksFileUri(folder);
    if (!uri) {
      return undefined;
    }

    const dirUri = vscode.Uri.joinPath(uri, '..');
    try {
      await vscode.workspace.fs.createDirectory(dirUri);
    } catch {
      // Ignore if directory already exists
    }

    const fileData = Buffer.from(content, 'utf8');
    await vscode.workspace.fs.writeFile(uri, fileData);
    return uri;
  }

  /**
   * Inserts or updates a task definition in .vscode/tasks.json.
   */
  public async addTaskDefinition(
    task: TaskConfigDefinition,
    folder?: vscode.WorkspaceFolder
  ): Promise<vscode.Uri | undefined> {
    let existing: { content: string; parsed: TasksJsonStructure } | undefined;
    try {
      existing = await this.readTasksJson(folder);
    } catch {
      return undefined;
    }

    const rawContent = existing ? existing.content : '';
    try {
      const updatedContent = insertOrUpdateTaskInJson(rawContent, task);
      return this.writeTasksJson(updatedContent, folder);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to parse tasks.json. File was not modified to prevent data loss: ${err instanceof Error ? err.message : String(err)}`
      );
      return undefined;
    }
  }

  /**
   * Resolves the 0-indexed line number of a task label in .vscode/tasks.json.
   */
  public async findTaskLine(taskLabel: string, folder?: vscode.WorkspaceFolder): Promise<number> {
    let existing: { content: string; parsed: TasksJsonStructure } | undefined;
    try {
      existing = await this.readTasksJson(folder);
    } catch {
      return -1;
    }
    if (!existing) {
      return -1;
    }
    return findTaskLineInContent(existing.content, taskLabel);
  }

  /**
   * Opens .vscode/tasks.json in the editor and jumps to the line defining the given task.
   */
  public async openTaskInEditor(
    taskLabel: string,
    folder?: vscode.WorkspaceFolder
  ): Promise<vscode.TextEditor | undefined> {
    const uri = this.getTasksFileUri(folder);
    if (!uri) {
      return undefined;
    }

    let existing: { content: string; parsed: TasksJsonStructure } | undefined;
    try {
      existing = await this.readTasksJson(folder);
    } catch {
      return undefined;
    }

    if (!existing) {
      const initialContent = formatTasksJson({ version: DEFAULTS.TASKS_VERSION, tasks: [] });
      await this.writeTasksJson(initialContent, folder);
      try {
        existing = await this.readTasksJson(folder);
      } catch {
        // Ignore
      }
    }

    const line = existing ? findTaskLineInContent(existing.content, taskLabel) : -1;

    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);

    if (line >= 0 && line < doc.lineCount) {
      const lineText = doc.lineAt(line).text;
      const charIndex = lineText.indexOf(taskLabel);
      const startChar = charIndex >= 0 ? charIndex : 0;
      const endChar = charIndex >= 0 ? charIndex + taskLabel.length : lineText.length;

      const range = new vscode.Range(new vscode.Position(line, startChar), new vscode.Position(line, endChar));
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }

    return editor;
  }

  /**
   * Opens .vscode/tasks.json in the editor, creating it with defaults if it does not exist.
   */
  public async openTasksJson(folder?: vscode.WorkspaceFolder): Promise<vscode.TextEditor | undefined> {
    const uri = this.getTasksFileUri(folder);
    if (!uri) {
      return undefined;
    }

    let existing: { content: string; parsed: TasksJsonStructure } | undefined;
    try {
      existing = await this.readTasksJson(folder);
    } catch {
      return undefined;
    }

    if (!existing) {
      const initialContent = formatTasksJson({ version: DEFAULTS.TASKS_VERSION, tasks: [] });
      await this.writeTasksJson(initialContent, folder);
    }

    const doc = await vscode.workspace.openTextDocument(uri);
    return vscode.window.showTextDocument(doc);
  }
}
