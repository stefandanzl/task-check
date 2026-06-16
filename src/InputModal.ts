import {App, Modal, Setting} from 'obsidian'

export type InputModalType = 'text' | 'number' | 'date'

export interface InputModalOptions {
  title: string
  ctaLabel: string
  type?: InputModalType
  initialValue?: string
  placeholder?: string
  onSubmit: (value: string) => void | Promise<void>
}

/**
 * Small modal with a single input, used for tag entry, priority numbers, and
 * dates. The input element's type is driven by `options.type` so the browser
 * provides the right keyboard / picker. Enter confirms, Escape cancels.
 */
export class InputModal extends Modal {
  private value = ''
  private inputEl!: HTMLInputElement

  constructor(
    app: App,
    private opts: InputModalOptions,
  ) {
    super(app)
  }

  onOpen(): void {
    this.value = this.opts.initialValue ?? ''
    this.titleEl.setText(this.opts.title)

    new Setting(this.contentEl).addText(text => {
      text.inputEl.type = this.opts.type ?? 'text'
      if (this.opts.type === 'number') text.inputEl.addClass('taskcheck-number-input')
      text
        .setValue(this.value)
        .setPlaceholder(this.opts.placeholder ?? '')
        .onChange(v => (this.value = v))
      this.inputEl = text.inputEl
    })

    new Setting(this.contentEl)
      .addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()))
      .addButton(btn =>
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

  private async submit(): Promise<void> {
    const raw = this.value.trim()
    const type = this.opts.type ?? 'text'
    if (type === 'number') {
      if (!raw || Number.isNaN(Number(raw))) return
      await this.opts.onSubmit(String(parseInt(raw, 10)))
    } else {
      if (!raw) return
      await this.opts.onSubmit(raw)
    }
    this.close()
  }
}
