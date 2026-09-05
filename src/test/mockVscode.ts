import * as path from 'path';

export class MockPosition {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class MockRange {
  constructor(public readonly start: MockPosition, public readonly end: MockPosition) {}
}

export class MockSelection extends MockRange {
  constructor(public readonly anchor: MockPosition, public readonly active: MockPosition) {
    super(anchor, active);
  }
}

export enum MockTextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}

export enum MockStatusBarAlignment {
  Left = 1,
  Right = 2,
}

export class MockStatusBarItem {
  public id?: string;
  public alignment: MockStatusBarAlignment;
  public priority?: number;
  public name?: string;
  public text: string = '';
  public tooltip?: string;
  public color?: string;
  public backgroundColor?: unknown;
  public command?: string;
  public isVisible = false;
  public isDisposed = false;

  constructor(
    idOrAlignment?: string | MockStatusBarAlignment,
    alignmentOrPriority?: MockStatusBarAlignment | number,
    priority?: number
  ) {
    if (typeof idOrAlignment === 'string') {
      this.id = idOrAlignment;
      this.alignment = (alignmentOrPriority as MockStatusBarAlignment) ?? MockStatusBarAlignment.Left;
      this.priority = priority;
    } else {
      this.alignment = idOrAlignment ?? MockStatusBarAlignment.Left;
      this.priority = alignmentOrPriority as number;
    }
  }

  public show(): void {
    this.isVisible = true;
  }

  public hide(): void {
    this.isVisible = false;
  }

  public dispose(): void {
    this.isVisible = false;
    this.isDisposed = true;
  }
}

export class MockUri {
  constructor(public readonly fsPath: string, public readonly scheme: string = 'file') {}

  public get path(): string {
    return this.fsPath;
  }

  public toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }

  public static file(filePath: string): MockUri {
    return new MockUri(filePath, 'file');
  }

  public static joinPath(base: MockUri, ...pathSegments: string[]): MockUri {
    const joined = path.join(base.fsPath, ...pathSegments);
    return new MockUri(joined, base.scheme);
  }
}

export class MockDisposable {
  constructor(private callOnDispose: () => void = () => {}) {}

  public dispose(): void {
    this.callOnDispose();
  }

  public static from(...disposables: { dispose(): unknown }[]): MockDisposable {
    return new MockDisposable(() => {
      for (const d of disposables) {
        d.dispose();
      }
    });
  }
}

export class MockEventEmitter<T = unknown> {
  private listeners: Array<(e: T) => unknown> = [];

  public event = (listener: (e: T) => unknown): MockDisposable => {
    this.listeners.push(listener);
    return new MockDisposable(() => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) {
        this.listeners.splice(idx, 1);
      }
    });
  };

  public fire(data: T): void {
    for (const l of [...this.listeners]) {
      l(data);
    }
  }

  public dispose(): void {
    this.listeners = [];
  }
}

export enum MockTaskScope {
  Folder = 1,
  Workspace = 2,
  Global = 3,
}

export class MockTask {
  public execution?: unknown;
  public problemMatchers: string[] = [];
  public group?: unknown;
  public presentationOptions?: unknown;
  public runOptions?: unknown;

  constructor(
    public definition: Record<string, unknown>,
    public scope: unknown,
    public name: string,
    public source: string,
    execution?: unknown
  ) {
    this.execution = execution;
  }
}

export class MockTaskExecution {
  public isTerminated = false;
  constructor(public task: MockTask, private onTerminate?: () => void) {}

  public terminate(): void {
    this.isTerminated = true;
    this.onTerminate?.();
  }
}

export class MockThemeIcon {
  constructor(public readonly id: string, public readonly color?: unknown) {}
}

export enum MockTreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class MockTreeItem {
  public description?: string;
  public tooltip?: string;
  public iconPath?: unknown;
  public contextValue?: string;
  public command?: { command: string; title: string; arguments?: unknown[] };

  constructor(
    public label: string,
    public collapsibleState: MockTreeItemCollapsibleState = MockTreeItemCollapsibleState.None
  ) {}
}

export enum MockQuickPickItemKind {
  Separator = -1,
  Default = 0,
}

export class MockQuickPick<T = unknown> {
  public title?: string;
  public placeholder?: string;
  public prompt?: string;
  public value: string = '';
  public buttons: readonly unknown[] = [];
  public items: readonly T[] = [];
  public selectedItems: readonly T[] = [];
  public activeItems: readonly T[] = [];
  public canSelectMany: boolean = false;
  public matchOnDescription: boolean = false;
  public matchOnDetail: boolean = false;
  public isVisible = false;
  public isDisposed = false;

  private readonly _onDidChangeValue = new MockEventEmitter<string>();
  public readonly onDidChangeValue = this._onDidChangeValue.event;

  private readonly _onDidAccept = new MockEventEmitter<void>();
  public readonly onDidAccept = this._onDidAccept.event;

  private readonly _onDidTriggerButton = new MockEventEmitter<unknown>();
  public readonly onDidTriggerButton = this._onDidTriggerButton.event;

  private readonly _onDidTriggerItemButton = new MockEventEmitter<{ button: unknown; item: T }>();
  public readonly onDidTriggerItemButton = this._onDidTriggerItemButton.event;

  private readonly _onDidHide = new MockEventEmitter<void>();
  public readonly onDidHide = this._onDidHide.event;

  public show(): void {
    this.isVisible = true;
  }

  public hide(): void {
    this.isVisible = false;
    this._onDidHide.fire();
  }

  public triggerAccept(): void {
    this._onDidAccept.fire();
  }

  public triggerButton(button: unknown): void {
    this._onDidTriggerButton.fire(button);
  }

  public triggerItemButton(button: unknown, item: T): void {
    this._onDidTriggerItemButton.fire({ button, item });
  }

  public dispose(): void {
    this.isVisible = false;
    this.isDisposed = true;
    this._onDidChangeValue.dispose();
    this._onDidAccept.dispose();
    this._onDidTriggerButton.dispose();
    this._onDidTriggerItemButton.dispose();
    this._onDidHide.dispose();
  }
}

export class MockMemento {
  private storage = new Map<string, unknown>();

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.storage.has(key)) {
      return this.storage.get(key) as T;
    }
    return defaultValue;
  }

  public async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.storage.delete(key);
    } else {
      this.storage.set(key, value);
    }
  }

  public keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }
}

export interface InMemoryFileSystem {
  [filePath: string]: Uint8Array;
}

export function createMockVscode(inMemoryFiles: InMemoryFileSystem = {}) {
  const fsStorage = { ...inMemoryFiles };

  const mockFs = {
    async readFile(uri: MockUri): Promise<Uint8Array> {
      const data = fsStorage[uri.fsPath];
      if (!data) {
        const error = new Error(`File not found: ${uri.fsPath}`);
        (error as unknown as { code: string }).code = 'FileNotFound';
        throw error;
      }
      return data;
    },
    async writeFile(uri: MockUri, content: Uint8Array): Promise<void> {
      fsStorage[uri.fsPath] = content;
    },
    async createDirectory(_uri: MockUri): Promise<void> {
      // In-memory directory creation is implicit
    },
  };

  const openedDocuments: Array<{ uri: MockUri; text: string }> = [];
  let lastRevealedRange: { range: MockRange; type: MockTextEditorRevealType } | undefined;
  const activeSelection: MockSelection | undefined = undefined;

  const globalConfigs: Record<string, unknown> = {};
  const onDidChangeConfigurationEmitter = new MockEventEmitter<{ affectsConfiguration: (section: string) => boolean }>();

  const mockWorkspace = {
    workspaceFolders: [
      {
        uri: MockUri.file('/mock/workspace'),
        name: 'workspace',
        index: 0,
      },
    ],
    fs: mockFs,
    async openTextDocument(uri: MockUri) {
      const data = fsStorage[uri.fsPath] || Buffer.from('', 'utf8');
      const text = Buffer.from(data).toString('utf8');
      const lines = text.split(/\r?\n/);
      const doc = {
        uri,
        lineCount: lines.length,
        lineAt(lineIndex: number) {
          return {
            lineNumber: lineIndex,
            text: lines[lineIndex] || '',
          };
        },
        getText() {
          return text;
        },
      };
      openedDocuments.push({ uri, text });
      return doc;
    },
    onDidChangeConfiguration: onDidChangeConfigurationEmitter.event,
    onDidChangeConfigurationEmitter,
    getConfiguration(section?: string) {
      return {
        get: <T>(key: string, defaultValue?: T): T => {
          const fullKey = section ? `${section}.${key}` : key;
          if (fullKey in globalConfigs && globalConfigs[fullKey] !== undefined) {
            return globalConfigs[fullKey] as T;
          }
          if (key in globalConfigs && globalConfigs[key] !== undefined) {
            return globalConfigs[key] as T;
          }
          return defaultValue as T;
        },
        has: (_key: string) => true,
        inspect: (_key: string) => undefined,
        update: async (key: string, value: unknown) => {
          const fullKey = section ? `${section}.${key}` : key;
          if (value === undefined) {
            delete globalConfigs[fullKey];
            delete globalConfigs[key];
          } else {
            globalConfigs[fullKey] = value;
            globalConfigs[key] = value;
          }
          onDidChangeConfigurationEmitter.fire({
            affectsConfiguration: (sec: string) => section === sec || key.startsWith(sec) || fullKey.startsWith(sec),
          });
        },
      };
    },
  };

  const createdStatusBarItems: MockStatusBarItem[] = [];
  const createdQuickPicks: MockQuickPick[] = [];
  const informationMessages: string[] = [];
  let inputBoxHandler: ((options?: unknown) => Promise<string | undefined> | string | undefined) | undefined;
  let quickPickHandler: ((items: unknown, options?: unknown) => Promise<unknown> | unknown) | undefined;

  const mockWindow = {
    createdStatusBarItems,
    createdQuickPicks,
    informationMessages,
    setInputBoxHandler(handler: ((options?: unknown) => Promise<string | undefined> | string | undefined) | undefined) {
      inputBoxHandler = handler;
    },
    setQuickPickHandler(handler: ((items: unknown, options?: unknown) => Promise<unknown> | unknown) | undefined) {
      quickPickHandler = handler;
    },
    createStatusBarItem(
      idOrAlignment?: string | MockStatusBarAlignment,
      alignmentOrPriority?: MockStatusBarAlignment | number,
      priority?: number
    ): MockStatusBarItem {
      const item = new MockStatusBarItem(idOrAlignment, alignmentOrPriority, priority);
      createdStatusBarItems.push(item);
      return item;
    },
    createQuickPick<T>() {
      const qp = new MockQuickPick<T>();
      createdQuickPicks.push(qp as unknown as MockQuickPick);
      return qp;
    },
    async showInputBox(options?: { validateInput?: (val: string) => string | undefined | Promise<string | undefined> }): Promise<string | undefined> {
      if (inputBoxHandler) {
        const val = await inputBoxHandler(options);
        if (val !== undefined && options?.validateInput) {
          const err = await options.validateInput(val);
          if (err) {
            return undefined;
          }
        }
        return val;
      }
      return undefined;
    },
    async showQuickPick(items: unknown, options?: unknown): Promise<unknown> {
      if (quickPickHandler) {
        return quickPickHandler(items, options);
      }
      if (Array.isArray(items) && items.length > 0) {
        return items[0];
      }
      return undefined;
    },
    async showInformationMessage(message: string): Promise<string> {
      informationMessages.push(message);
      return message;
    },
    async showErrorMessage(message: string, ..._items: unknown[]): Promise<string> {
      informationMessages.push(message);
      return message;
    },
    async showWarningMessage(message: string, ...items: string[]): Promise<string | undefined> {
      informationMessages.push(message);
      return items[0];
    },
    async showTextDocument(doc: { uri: MockUri; lineCount: number; lineAt: (i: number) => { lineNumber: number; text: string } }) {
      const editor = {
        document: doc,
        selection: activeSelection || new MockSelection(new MockPosition(0, 0), new MockPosition(0, 0)),
        revealRange(range: MockRange, type: MockTextEditorRevealType) {
          lastRevealedRange = { range, type };
        },
      };
      return editor;
    },
    registerTreeDataProvider(_viewId: string, _treeDataProvider: unknown) {
      return new MockDisposable();
    },
  };

  const tasksList: MockTask[] = [];
  const runningExecutions: MockTaskExecution[] = [];

  const onDidStartTaskEmitter = new MockEventEmitter<{ execution: MockTaskExecution }>();
  const onDidEndTaskEmitter = new MockEventEmitter<{ execution: MockTaskExecution }>();
  const onDidStartTaskProcessEmitter = new MockEventEmitter<{ execution: MockTaskExecution; processId: number }>();
  const onDidEndTaskProcessEmitter = new MockEventEmitter<{ execution: MockTaskExecution; exitCode: number }>();

  const mockTasks = {
    get taskExecutions() {
      return [...runningExecutions];
    },
    setTasks(tasks: MockTask[]) {
      tasksList.length = 0;
      tasksList.push(...tasks);
    },
    clearExecutions() {
      runningExecutions.length = 0;
    },
    async fetchTasks(): Promise<MockTask[]> {
      return [...tasksList];
    },
    async executeTask(task: MockTask): Promise<MockTaskExecution> {
      let execution: MockTaskExecution;
      execution = new MockTaskExecution(task, () => {
        const idx = runningExecutions.indexOf(execution);
        if (idx >= 0) {
          runningExecutions.splice(idx, 1);
        }
        onDidEndTaskProcessEmitter.fire({ execution, exitCode: 0 });
        onDidEndTaskEmitter.fire({ execution });
      });
      runningExecutions.push(execution);
      onDidStartTaskEmitter.fire({ execution });
      onDidStartTaskProcessEmitter.fire({ execution, processId: 1000 + Math.floor(Math.random() * 1000) });
      return execution;
    },
    terminateExecution(execution: MockTaskExecution) {
      execution.terminate();
    },

    onDidStartTask: onDidStartTaskEmitter.event,
    onDidEndTask: onDidEndTaskEmitter.event,
    onDidStartTaskProcess: onDidStartTaskProcessEmitter.event,
    onDidEndTaskProcess: onDidEndTaskProcessEmitter.event,
    onDidStartTaskEmitter,
    onDidEndTaskEmitter,
    onDidStartTaskProcessEmitter,
    onDidEndTaskProcessEmitter,
  };

  const startedDebugSessions: Array<{ id: string; name: string; type: string; configuration: unknown; workspaceFolder: unknown }> = [];
  const onDidStartDebugSessionEmitter = new MockEventEmitter<unknown>();
  const onDidTerminateDebugSessionEmitter = new MockEventEmitter<unknown>();

  const mockDebug = {
    activeDebugSession: undefined as unknown,
    startedDebugSessions,
    onDidStartDebugSession: onDidStartDebugSessionEmitter.event,
    onDidTerminateDebugSession: onDidTerminateDebugSessionEmitter.event,
    onDidStartDebugSessionEmitter,
    onDidTerminateDebugSessionEmitter,
    async startDebugging(folder: unknown, nameOrConfig: unknown): Promise<boolean> {
      const configObj = typeof nameOrConfig === 'object' && nameOrConfig !== null ? (nameOrConfig as { name?: string; type?: string }) : undefined;
      const session = {
        id: `debug-${Date.now()}-${Math.random()}`,
        name: typeof nameOrConfig === 'string' ? nameOrConfig : (configObj?.name ?? 'Debug'),
        type: configObj?.type ?? 'node',
        configuration: nameOrConfig,
        workspaceFolder: folder,
      };
      mockDebug.activeDebugSession = session;
      startedDebugSessions.push(session);
      onDidStartDebugSessionEmitter.fire(session);
      return true;
    },
    stopDebugging() {
      if (mockDebug.activeDebugSession) {
        const session = mockDebug.activeDebugSession;
        mockDebug.activeDebugSession = undefined;
        onDidTerminateDebugSessionEmitter.fire(session);
      }
    },
  };

  const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

  const mockCommands = {
    registeredCommands,
    registerCommand(command: string, callback: (...args: unknown[]) => unknown, _thisArg?: unknown): MockDisposable {
      registeredCommands.set(command, callback);
      return new MockDisposable(() => {
        registeredCommands.delete(command);
      });
    },
    async executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T | undefined> {
      const handler = registeredCommands.get(command);
      if (!handler) {
        throw new Error(`Command not found: ${command}`);
      }
      return (await handler(...args)) as T;
    },
    async getCommands(_filterInternal?: boolean): Promise<string[]> {
      return Array.from(registeredCommands.keys());
    },
  };

  const vscodeModule = {
    Uri: MockUri,
    Position: MockPosition,
    Range: MockRange,
    Selection: MockSelection,
    TextEditorRevealType: MockTextEditorRevealType,
    Disposable: MockDisposable,
    EventEmitter: MockEventEmitter,
    Task: MockTask,
    TaskExecution: MockTaskExecution,
    TaskScope: MockTaskScope,
    StatusBarAlignment: MockStatusBarAlignment,
    StatusBarItem: MockStatusBarItem,
    ThemeIcon: MockThemeIcon,
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: MockTreeItemCollapsibleState,
    QuickPickItemKind: MockQuickPickItemKind,
    workspace: mockWorkspace,
    window: mockWindow,
    tasks: mockTasks,
    debug: mockDebug,
    commands: mockCommands,
  };

  return {
    vscodeModule,
    fsStorage,
    mockFs,
    mockWorkspace,
    mockWindow,
    mockTasks,
    mockDebug,
    mockCommands,
    openedDocuments,
    getLastRevealedRange: () => lastRevealedRange,
    onDidChangeConfigurationEmitter,
  };
}

export class MockExtensionContext {
  public subscriptions: Array<{ dispose(): unknown }> = [];
  public workspaceState = new MockMemento();
  public globalState = new MockMemento();
  public extensionUri = MockUri.file('/mock/extension');
  public extensionPath = '/mock/extension';
  public storageUri = MockUri.file('/mock/storage');
  public globalStorageUri = MockUri.file('/mock/globalStorage');
  public logUri = MockUri.file('/mock/log');

  public asAbsolutePath(relativePath: string): string {
    return path.join(this.extensionPath, relativePath);
  }
}

let activeMock: ReturnType<typeof createMockVscode> | undefined;

/**
 * Installs the mock vscode module in Node's module loader cache.
 */
export function setupVscodeMock(inMemoryFiles: InMemoryFileSystem = {}) {
  const mock = createMockVscode(inMemoryFiles);
  activeMock = mock;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Module = require('module');
  const origLoad = Module._load;

  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'vscode') {
      return activeMock?.vscodeModule;
    }
    return origLoad.call(this, request, parent, isMain);
  };

  return mock;
}
