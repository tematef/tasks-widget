# Task Dropdown & Runner Widget

An IntelliJ IDEA-style Run Configuration and Task Dropdown widget in the VS Code status bar.

## Features

- **Task Selector Dropdown**: Displays the active workspace task (`$(checklist) <Task Name> ▾`) or a placeholder (`$(checklist) Select Task ▾`). Clicking opens a QuickPick menu listing configured workspace tasks and auto-detected tasks with status indicators.
- **Dynamic Play / Stop Toggle**: Shows `$(play)` to run the active task when idle; dynamically switches to `$(debug-stop)` to terminate task execution while running.
- **Debug Button**: Shows `$(debug-alt)` to start debugging sessions matching the active task from `.vscode/launch.json`.
- **Add New Task**: Guided interactive 4-step wizard to create shell or process tasks, select task groups (build/test), and automatically save them into `.vscode/tasks.json`.
- **Direct Task Editing**: Jump directly to task definitions in `.vscode/tasks.json` with cursor positioning via item edit buttons.
- **Session Persistence**: Remembers active task selections across editor sessions via workspace state.

## Requirements

- VS Code version 1.85.0 or higher.

## Commands

| Command | Title | Description |
|---|---|---|
| `tasksWidget.selectTask` | Select Task | Opens the task selector QuickPick dropdown. |
| `tasksWidget.runSelectedTask` | Run Selected Task | Runs the active task, or opens task selector if none active. |
| `tasksWidget.stopSelectedTask` | Stop Selected Task | Terminates the running process of the selected task. |
| `tasksWidget.debugSelectedTask` | Debug Selected Task | Launches a matching debug configuration from `launch.json`. |
| `tasksWidget.addNewTask` | Add New Task | Starts a guided prompt flow to define a new task in `tasks.json`. |
| `tasksWidget.editTask` | Edit Task in tasks.json | Opens `tasks.json` and navigates to the definition of the task. |
| `tasksWidget.configureTasks` | Configure tasks.json | Opens `.vscode/tasks.json` for manual editing. |

## Extension Settings

This extension contributes the following settings:

- `tasksWidget.showDebugButton` (`boolean`, default: `true`): Show the debug button next to the play button in the status bar.
- `tasksWidget.statusBarPriority` (`number`, default: `100`): Priority order of the task dropdown items in the status bar.
