# Task Dropdown & Runner Widget (IntelliJ-style) Plan

## Overview
Build a VS Code extension that mimics IntelliJ IDEA's Run Configuration widget in the Status Bar. The widget provides:
1. **Task Selector & Dropdown**:
   - Status bar item showing the active task (`$(checklist) <Task Name> ▾`).
   - Clicking opens a QuickPick menu listing all workspace tasks and auto-detected scripts.
   - **IntelliJ-style QuickPick Actions**:
     - QuickPick title buttons: `$(add)` (Add New Task) and `$(gear)` (Configure tasks.json).
     - Per-item action button: `$(edit)` on each task item to jump directly to its definition in `.vscode/tasks.json`.
     - Action entries in dropdown list: `$(add) Add New Task...` and `$(gear) Edit Tasks (tasks.json)...`.
2. **Add & Edit Task Management**:
   - **Add New Task**: Guided prompt flow (Task Name -> Command -> Shell/Process -> Build/Test group), automatically inserting the formatted task definition into `.vscode/tasks.json` and selecting it as active.
   - **Edit Existing Task**: Opens `.vscode/tasks.json`, navigates cursor to the task definition line, and highlights it. For auto-detected tasks, provides "Customize in tasks.json" template generation.
3. **Play / Dynamic Stop Button**:
   - **When idle**: shows `$(play)` with tooltip to execute the selected task.
   - **When running**: dynamically replaced with `$(debug-stop)` to terminate the running task process.
4. **Debug Button**:
   - `$(debug-alt)` button adjacent to Play to run matching `.vscode/launch.json` configuration or trigger debug session.
5. **State Persistence**:
   - Selected task is saved in `context.workspaceState` across VS Code restarts.

---

## Implementation Steps
- [ ] Initialize project configuration files (`package.json`, `tsconfig.json`, `.gitignore`, `.vscodeignore`) with TypeScript and VS Code extension dependencies.
- [ ] Install dependencies (`npm install` for `@types/vscode`, `@types/node`, `typescript`).
- [ ] Create `src/constants.ts` defining command IDs (`selectTask`, `runSelectedTask`, `stopSelectedTask`, `debugSelectedTask`, `addNewTask`, `editTask`, `configureTasks`), configuration keys, and workspace storage keys.
- [ ] Create `src/taskConfigManager.ts` to manage `.vscode/tasks.json` reading and writing (generating template, adding new task definitions, finding line numbers for task definitions to reveal in editor, and customizing auto-detected tasks).
- [ ] Create `src/taskManager.ts` to fetch tasks (`vscode.tasks.fetchTasks`), persist/restore selected task via `workspaceState`, track running `vscode.TaskExecution`, and handle termination.
- [ ] Create `src/debugManager.ts` to match tasks with `.vscode/launch.json` configurations or initiate debugging via `vscode.debug.startDebugging`.
- [ ] Create `src/statusBar.ts` to manage Status Bar UI items (Task Selector, Play/Stop toggle button, and Debug button), handling live updates when tasks start, finish, or are terminated.
- [ ] Create `src/quickPickController.ts` to build the IntelliJ-style QuickPick dropdown with item `$(edit)` buttons, title bar `$(add)` button, and action entries (`Add New Task...`, `Edit Tasks...`).
- [ ] Create `src/extension.ts` to register all commands, wire event listeners (`onDidStartTaskProcess`, `onDidEndTaskProcess`), and register disposables.
- [ ] Compile TypeScript with `npm run compile` and verify zero compilation errors.
- [ ] Create sample `.vscode/tasks.json` and `.vscode/launch.json` in the workspace to test task listing, running, stopping, debugging, adding, and editing.
