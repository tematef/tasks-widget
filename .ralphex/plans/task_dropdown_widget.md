# Task Dropdown & Runner Widget (IntelliJ-style) Plan

## Overview
Build a VS Code extension that mimics IntelliJ IDEA's Run Configuration widget in the Status Bar. The widget provides:
1. **Task Selector & Dropdown**:
   - Status bar item showing the active task (`$(checklist) <Task Name> ▾`).
   - Clicking opens a QuickPick menu listing all workspace tasks and auto-detected scripts.
   - QuickPick title buttons: `$(add)` (Add New Task) and `$(gear)` (Configure tasks.json).
   - Per-item action button: `$(edit)` on each task item to jump directly to its definition in `.vscode/tasks.json`.
   - Dedicated list actions: `$(add) Add New Task...` and `$(gear) Edit Tasks (tasks.json)...`.
2. **Add & Edit Task Management**:
   - **Add New Task**: Guided prompt flow (Task Name -> Command -> Shell/Process -> Build/Test group), automatically inserting the formatted task definition into `.vscode/tasks.json` and selecting it as active.
   - **Edit Existing Task**: Opens `.vscode/tasks.json`, navigates cursor to the task definition line, and highlights it.
3. **Play / Dynamic Stop Button**:
   - When idle: shows `$(play)` with tooltip to execute the selected task.
   - When running: dynamically replaced with `$(debug-stop)` to terminate the running task process.
4. **Debug Button**:
   - `$(debug-alt)` button adjacent to Play to run matching `.vscode/launch.json` configuration or trigger debug session.
5. **State Persistence**:
   - Selected task is saved in `context.workspaceState` across VS Code restarts.

## Implementation Steps

### Task 1: Extension Scaffolding and TypeScript Configuration
- [x] Initialize `package.json` with extension manifest metadata, command contributions, configuration settings, and dependencies (`@types/vscode`, `@types/node`, `typescript`).
- [x] Create `tsconfig.json` with target ES2022 and CommonJS module output.
- [x] Create `.vscodeignore` to exclude development and test files from the extension bundle.
- [x] Run `npm install` to install compiler and type definition dependencies.

### Task 2: Core Constants and Task Configuration Manager
- [x] Create `src/constants.ts` with command IDs, configuration keys, and workspace storage keys.
- [x] Create `src/taskConfigManager.ts` to handle `.vscode/tasks.json` reading, writing, formatted insertion of new tasks, and line number resolution for task editing.

### Task 3: Task Manager and Debug Manager Implementation
- [x] Create `src/taskManager.ts` to fetch tasks via `vscode.tasks.fetchTasks()`, track active `vscode.TaskExecution`, handle task process termination, and persist/restore active task selection using `workspaceState`.
- [x] Create `src/debugManager.ts` to resolve configurations in `.vscode/launch.json` matching the active task or initiate debugging via `vscode.debug.startDebugging()`.


### Task 4: Status Bar Controller
- [x] Create `src/statusBar.ts` managing the three status bar items: Task Selector (`$(checklist)`), Play/Stop toggle (`$(play)` / `$(debug-stop)`), and Debug (`$(debug-alt)`).
- [x] Implement event listeners for task process lifecycle (`onDidStartTaskProcess`, `onDidEndTaskProcess`) to swap between Play and Stop dynamically.

### Task 5: QuickPick Dropdown Controller with Add and Edit Actions
- [x] Create `src/quickPickController.ts` to render the QuickPick dropdown with grouped tasks, item-level `$(edit)` buttons to open `tasks.json` at the task line, title bar `$(add)` button, and `Add New Task` / `Edit Tasks` menu entries.
- [x] Implement the interactive Add New Task flow prompting for label, command, execution type, and group.

### Task 6: Extension Entrypoint and Command Registration
- [x] Create `src/extension.ts` wiring all commands (`selectTask`, `runSelectedTask`, `stopSelectedTask`, `debugSelectedTask`, `addNewTask`, `editTask`, `configureTasks`) and registering disposables.
- [x] Compile TypeScript with `npm run compile` and fix any compiler or type errors.

### Task 7: Workspace Verification and Sample Tasks
- [ ] Create sample `.vscode/tasks.json` and `.vscode/launch.json` demonstrating build, test, and long-running watch tasks.
- [ ] Verify that TypeScript compilation passes cleanly with zero warnings or errors.
