import {App, FuzzySuggestModal} from 'obsidian'

import {TASK_STATES, type TaskState} from './constants'

/**
 * Fuzzy picker for a task's checkbox status. Items render as `[symbol] Label`
 * (e.g. `[?] Question`) since the built-in modal only matches on plain text —
 * no icons/SVGs. Hands the chosen symbol back via the onChoose callback.
 */
export class StatusSuggestModal extends FuzzySuggestModal<TaskState> {
  private readonly onChoose: (symbol: string) => void

  constructor(app: App, onChoose: (symbol: string) => void) {
    super(app)
    this.onChoose = onChoose
    this.setPlaceholder('Choose a task status…')
  }

  getItems(): TaskState[] {
    return TASK_STATES
  }

  getItemText(item: TaskState): string {
    return `[${item.symbol}] ${item.label}`
  }

  onChooseItem(item: TaskState) {
    this.onChoose(item.symbol)
  }
}
