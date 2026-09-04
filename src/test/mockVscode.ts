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
    getConfiguration(section?: string) {
      const configs: Record<string, unknown> = {};
      return {
        get: <T>(key: string, defaultValue?: T): T => {
          const fullKey = section ? `${section}.${key}` : key;
          if (fullKey in configs) {
            return configs[fullKey] as T;
          }
          if (key in configs) {
            return configs[key] as T;
          }
          return defaultValue as T;
        },
        has: (_key: string) => true,
        inspect: (_key: string) => undefined,
        update: async (key: string, value: unknown) => {
          configs[key] = value;
        },
      };
    },
  };

  const mockWindow = {
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
    workspace: mockWorkspace,
    window: mockWindow,
    tasks: mockTasks,
    debug: mockDebug,
  };

  return {
    vscodeModule,
    fsStorage,
    mockFs,
    mockWorkspace,
    mockWindow,
    mockTasks,
    mockDebug,
    openedDocuments,
    getLastRevealedRange: () => lastRevealedRange,
  };
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
