/**
 * Command IDs registered by the Tasks Widget extension.
 */
export const COMMANDS = {
  SELECT_TASK: 'tasksWidget.selectTask',
  RUN_SELECTED_TASK: 'tasksWidget.runSelectedTask',
  STOP_SELECTED_TASK: 'tasksWidget.stopSelectedTask',
  DEBUG_SELECTED_TASK: 'tasksWidget.debugSelectedTask',
  ADD_NEW_TASK: 'tasksWidget.addNewTask',
  EDIT_TASK: 'tasksWidget.editTask',
  CONFIGURE_TASKS: 'tasksWidget.configureTasks',
  REFRESH_TASKS: 'tasksWidget.refreshTasks',
  SELECT_TREE_TASK: 'tasksWidget.selectTreeTask',
  RUN_TREE_TASK: 'tasksWidget.runTreeTask',
  DEBUG_TREE_TASK: 'tasksWidget.debugTreeTask',
  EDIT_TREE_TASK: 'tasksWidget.editTreeTask',
} as const;

export type CommandId = typeof COMMANDS[keyof typeof COMMANDS];

/**
 * Configuration section and keys defined in package.json.
 */
export const CONFIG_SECTION = 'tasksWidget';

export const CONFIG_KEYS = {
  SHOW_DEBUG_BUTTON: 'showDebugButton',
  STATUS_BAR_PRIORITY: 'statusBarPriority',
  SHOW_STATUS_BAR_WIDGET: 'showStatusBarWidget',
  SHOW_ACTIVITY_BAR_VIEW: 'showActivityBarView',
  SHOW_EXPLORER_VIEW: 'showExplorerView',
} as const;

export type ConfigKey = typeof CONFIG_KEYS[keyof typeof CONFIG_KEYS];

/**
 * Keys used for persisting state across sessions in context.workspaceState.
 */
export const STORAGE_KEYS = {
  ACTIVE_TASK_LABEL: 'tasksWidget.activeTaskLabel',
  ACTIVE_TASK_ID: 'tasksWidget.activeTaskId',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];

/**
 * Default values and UI constants.
 */
export const DEFAULTS = {
  STATUS_BAR_PRIORITY: 100,
  SHOW_DEBUG_BUTTON: true,
  SHOW_STATUS_BAR_WIDGET: true,
  SHOW_ACTIVITY_BAR_VIEW: true,
  SHOW_EXPLORER_VIEW: true,
  TASKS_FILE_NAME: 'tasks.json',
  LAUNCH_FILE_NAME: 'launch.json',
  VSCODE_DIR_NAME: '.vscode',
  TASKS_VERSION: '2.0.0',
} as const;

