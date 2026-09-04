# Tasks Widget Extension

IntelliJ IDEA-style Run Configuration & Task Dropdown widget in the VS Code status bar.

## Build and Test Commands
- Compile TypeScript: `npm run compile` (`tsc -p ./`)
- Watch mode: `npm run watch` (`tsc -watch -p ./`)
- Run tests: `npm test` (`npm run compile && node --test out/test/*.test.js`)

## Architecture & Project Structure
- `src/constants.ts`: Command IDs, configuration setting keys, workspace storage keys, and defaults.
- `src/taskConfigManager.ts`: Direct `.vscode/tasks.json` manipulation, JSON comment stripping, trailing comma tolerance, task definition insertion/updates, and line number resolution.
- `src/taskManager.ts`: Lifecycle management for `vscode.Task`, tracking active executions, handling process termination, and persisting active task selections across sessions via `workspaceState`.
- `src/debugManager.ts`: Resolves `.vscode/launch.json` debug configurations matching active tasks and initiates debug sessions.
- `src/statusBar.ts`: Controller managing the three status bar items (`taskSelector`, `playStop`, `debug`) and dynamic play/stop toggling via task process lifecycle events.
- `src/quickPickController.ts`: Dropdown UI grouping tasks, providing item-level edit buttons, title bar action buttons, and the interactive 4-step `addNewTaskFlow`.
- `src/extension.ts`: Entrypoint registering all 7 commands and attaching disposables to `context.subscriptions`.

## Testing Conventions
- Tests run using Node.js built-in test runner (`node --test`) without requiring the VS Code extension host.
- `src/test/mockVscode.ts` provides a complete in-memory mock of the VS Code API (`workspace`, `window`, `tasks`, `debug`, `commands`).
