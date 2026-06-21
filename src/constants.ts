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
  {symbol: '!', label: 'Important', icon: 'task-exclamation', fragments: [ICON_FRAGMENTS.EXCLAMATION, ICON_FRAGMENTS.DOT_BOTTOM]},
  {symbol: '?', label: 'Question', icon: 'task-question', fragments: [ICON_FRAGMENTS.QUESTION, ICON_FRAGMENTS.DOT_BOTTOM]},
  {symbol: 'i', label: 'Information', icon: 'task-information', fragments: [ICON_FRAGMENTS.INFORMATION, ICON_FRAGMENTS.DOT_TOP]},
  {symbol: '>', label: 'Forwarded', icon: 'task-right', fragments: [ICON_FRAGMENTS.RIGHT]},
  {symbol: '<', label: 'Scheduled', icon: 'task-left', fragments: [ICON_FRAGMENTS.LEFT]},
  {symbol: '/', label: 'In progress', icon: 'task-slash', fragments: [ICON_FRAGMENTS.SLASH]},
  {symbol: '-', label: 'Cancelled', icon: 'task-dash', fragments: [ICON_FRAGMENTS.DASH]},
]

export const LOCAL_SORT_OPT = {
  numeric: true,
  ignorePunctuation: true,
}
