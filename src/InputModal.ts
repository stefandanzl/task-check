import {App, Modal, Setting} from 'obsidian'

export type InputModalType = 'text' | 'number' | 'date' | 'datetime'

export interface InputModalOptions {
  title: string
  ctaLabel: string
  type?: InputModalType
  initialValue?: string
  /** For type 'datetime': the initial time part (HH:mm). */
  initialTime?: string
  placeholder?: string
  onSubmit: (value: string) => void | Promise<void>
  /** Immediate-action buttons in the button row (e.g. -1 / +1). They bypass
   *  input validation — the caller acts directly and the modal closes. */
  quickButtons?: Array<{label: string, onClick: () => void | Promise<void>}>
  /** Optional secondary action button; receives the same validated value. */
  altButton?: {
    label: string
    onSubmit: (value: string) => void | Promise<void>
  }
}

/**
 * Small modal with a single input, used for tag entry, priority numbers, and
 * dates. The input element's type is driven by `options.type` so the browser
 * provides the right keyboard / picker. Enter confirms, Escape cancels.
 */
export class InputModal extends Modal {
  private value = ''
  private timeValue = ''
  private inputEl!: HTMLInputElement

  constructor(
    app: App,
    private opts: InputModalOptions,
  ) {
    super(app)
  }

  onOpen(): void {
    this.value = this.opts.initialValue ?? ''
    this.timeValue = this.opts.type === 'datetime' ? (this.opts.initialTime ?? '') : ''
    this.titleEl.setText(this.opts.title)

    new Setting(this.contentEl).addText(text => {
      // 'datetime' uses two inputs: date here, time in the Setting below.
      text.inputEl.type =
        this.opts.type === 'number' ? 'number'
        : this.opts.type === 'text' ? 'text'
        : 'date'
      if (this.opts.type === 'number') text.inputEl.addClass('taskcheck-number-input')
      text
        .setValue(this.value)
        .setPlaceholder(this.opts.placeholder ?? '')
        .onChange(v => (this.value = v))
      this.inputEl = text.inputEl
    })

    if (this.opts.type === 'datetime') {
      new Setting(this.contentEl).addText(text => {
        text.inputEl.type = 'time'
        text.setValue(this.timeValue).onChange(v => (this.timeValue = v))
      })
    }

    if (this.opts.quickButtons?.length) {
      // Separate row above the button row — immediate actions, not part of
      // the cancel/save flow.
      const quickRow = new Setting(this.contentEl)
      for (const qb of this.opts.quickButtons) {
        quickRow.addButton(btn =>
          btn.setButtonText(qb.label).onClick(async () => {
            await qb.onClick()
            this.close()
          }),
        )
      }
    }

    const buttonRow = new Setting(this.contentEl).addButton(btn =>
      btn.setButtonText('Cancel').onClick(() => this.close()),
    )
    if (this.opts.altButton) {
      buttonRow.addButton(btn =>
        btn
          .setButtonText(this.opts.altButton.label)
          .onClick(() => this.commit(this.opts.altButton!.onSubmit)),
      )
    }
    buttonRow.addButton(btn =>
      btn
        .setButtonText(this.opts.ctaLabel)
        .setCta()
        .onClick(() => this.submit()),
    )

    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.submit()
      } else if (e.key === 'Escape') {
        this.close()
      }
    })

    window.setTimeout(() => {
      this.inputEl.focus()
      this.inputEl.select()
    }, 0)
  }

  onClose(): void {
    this.contentEl.empty()
  }

  private submit(): Promise<void> {
    return this.commit(this.opts.onSubmit)
  }

  /** Validates the current value, runs the given handler, closes the modal. */
  private async commit(handler: (value: string) => void | Promise<void>): Promise<void> {
    const raw = this.value.trim()
    const type = this.opts.type ?? 'text'
    if (type === 'number') {
      // Empty passes through as '' — handlers decide what it means (e.g.
      // priority: empty family-set = remove from all members).
      if (raw !== '' && Number.isNaN(Number(raw))) return
      await handler(raw === '' ? '' : String(parseInt(raw, 10)))
    } else if (type === 'datetime') {
      // Date required, optional time → submitted as "YYYY-MM-DD[ HH:mm]".
      if (!raw) return
      const t = this.timeValue.trim()
      await handler(t ? `${raw} ${t}` : raw)
    } else {
      if (!raw) return
      await handler(raw)
    }
    this.close()
  }
}
