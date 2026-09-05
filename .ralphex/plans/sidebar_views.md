# Left Panel Sidebar Views Plan

## Overview
Implement two distinct left-panel representations of the Tasks Widget in separate git branches, keeping `task_dropdown_widget` untouched.

## Implementation Steps

### Task 1: Create Shared Tree Data Provider
- [ ] Implement `src/tasksTreeDataProvider.ts` implementing `vscode.TreeDataProvider<TaskTreeItem>`.
- [ ] Implement unit tests in `src/test/tasksTreeDataProvider.test.ts`.
- [ ] Verify unit tests pass with `npm test`.

### Task 2: Implement Activity Bar View Branch
- [ ] Create branch `feature/activity-bar-view` off `task_dropdown_widget`.
- [ ] Add Activity Bar ViewContainer and View contributions to `package.json`.
- [ ] Add `resources/tasks-icon.svg` for the Activity Bar icon.
- [ ] Register TreeDataProvider for `tasksWidget.sidebarView` in `src/extension.ts`.
- [ ] Run `npm test` and compile cleanly.
- [ ] Build VSIX artifact `tasks-widget-activitybar-0.0.2.vsix`.
- [ ] Commit changes to `feature/activity-bar-view`.

### Task 3: Implement Explorer Sidebar View Branch
- [ ] Switch back to `task_dropdown_widget` and branch `feature/explorer-sidebar-view`.
- [ ] Add Explorer View contribution to `package.json` under `views.explorer`.
- [ ] Register TreeDataProvider for `tasksWidget.explorerView` in `src/extension.ts`.
- [ ] Run `npm test` and compile cleanly.
- [ ] Build VSIX artifact `tasks-widget-explorer-0.0.2.vsix`.
- [ ] Commit changes to `feature/explorer-sidebar-view`.
- [ ] Switch back to `task_dropdown_widget` to keep workspace in initial state.
