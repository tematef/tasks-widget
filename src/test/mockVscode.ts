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
  let activeSelection: MockSelection | undefined;

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

  const vscodeModule = {
    Uri: MockUri,
    Position: MockPosition,
    Range: MockRange,
    Selection: MockSelection,
    TextEditorRevealType: MockTextEditorRevealType,
    workspace: mockWorkspace,
    window: mockWindow,
  };

  return {
    vscodeModule,
    fsStorage,
    mockFs,
    mockWorkspace,
    mockWindow,
    openedDocuments,
    getLastRevealedRange: () => lastRevealedRange,
  };
}

/**
 * Installs the mock vscode module in Node's module loader cache.
 */
export function setupVscodeMock(inMemoryFiles: InMemoryFileSystem = {}) {
  const mock = createMockVscode(inMemoryFiles);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Module = require('module');
  const origLoad = Module._load;

  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === 'vscode') {
      return mock.vscodeModule;
    }
    return origLoad.call(this, request, parent, isMain);
  };

  return mock;
}
