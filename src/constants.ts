export const TODO_VIEW_TYPE = 'todo'

export const DONE_TASK_SYMBOLS = new Set(['x', 'X', '-'])

export type TaskState = {
  symbol: string
  label: string
  icon: string
  fragments: string[]
}

export const ICON_FRAGMENTS = {
  DONE: `<path d="M 8,16 16,8" fill="none" stroke="currentColor" /><path d="M 16,16 8,8" fill="none" stroke="currentColor" />`,
  EXCLAMATION: `<path d="M12 6v9" fill="none" stroke="currentColor" />`,
  QUESTION: `<path d="M9 9c0-3 3-3 3-3s3 0 3 3-3 3-3 6" fill="none" stroke="currentColor"/>`,
  INFORMATION: `<path d="M 12,18 V 9" fill="none" stroke="currentColor"/>`,
  LEFT: `<path d="m 16,7 -8,5 8,5" fill="none" stroke="currentColor" />`,
  RIGHT: `<path d="m 8,7 8,5 -8,5" fill="none" stroke="currentColor" />`,
  SLASH: `<path d="M 10,18 14,6" fill="none" stroke="currentColor" />`,
  DASH: `<path d="M8 12h8" fill="none" stroke="currentColor" />`,
  TODAY: `<path d="M7 6h10" fill="none" stroke="currentColor" /><path d="M12 18V6" fill="none" stroke="currentColor" />`,
  PRO: `<path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" fill="currentColor" stroke="none" />`,
  CON: `<path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" fill="currentColor" stroke="none" />`,
  BRACKETS: `<path d="M18 21h3v-18h-3" fill="none" stroke="currentColor" />\n  <path d="M6 3h-3v18h3" fill="none" stroke="currentColor" />`,
  DOT_BOTTOM: `<circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />`,
  DOT_TOP: `<circle cx="12" cy="6" r="1" fill="currentColor" stroke="none" />`,
}

/**
 * Alternate checkbox states offered in the task context menu. Hardcoded for
 * now — adjust this list (and the matching CSS in styles.css) to change what's
 * available. Symbols are single characters placed inside `- [ ]`.
 */
export const TASK_STATES: TaskState[] = [
  {symbol: 'x', label: 'Done', icon: 'task-done', fragments: [ICON_FRAGMENTS.DONE]},
  {symbol: ' ', label: 'Open', icon: 'task-open', fragments: []},
  {symbol: 'T', label: 'Today', icon: 'task-today', fragments: [ICON_FRAGMENTS.TODAY]},
  {symbol: '!', label: 'Important', icon: 'task-exclamation', fragments: [ICON_FRAGMENTS.EXCLAMATION, ICON_FRAGMENTS.DOT_BOTTOM]},
  {symbol: '?', label: 'Question', icon: 'task-question', fragments: [ICON_FRAGMENTS.QUESTION, ICON_FRAGMENTS.DOT_BOTTOM]},
  {symbol: 'i', label: 'Information', icon: 'task-information', fragments: [ICON_FRAGMENTS.INFORMATION, ICON_FRAGMENTS.DOT_TOP]},
  {symbol: '>', label: 'Forwarded', icon: 'task-right', fragments: [ICON_FRAGMENTS.RIGHT]},
  {symbol: '<', label: 'Scheduled', icon: 'task-left', fragments: [ICON_FRAGMENTS.LEFT]},
  {symbol: '/', label: 'In progress', icon: 'task-slash', fragments: [ICON_FRAGMENTS.SLASH]},
  {symbol: 'p', label: 'Pro', icon: 'task-pro', fragments: [ICON_FRAGMENTS.PRO]},
  {symbol: 'c', label: 'Con', icon: 'task-con', fragments: [ICON_FRAGMENTS.CON]},
  {symbol: '-', label: 'Cancelled', icon: 'task-dash', fragments: [ICON_FRAGMENTS.DASH]},
]

export const LOCAL_SORT_OPT = {
  numeric: true,
  ignorePunctuation: true,
}
