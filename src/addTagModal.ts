import {App, Modal, Setting} from 'obsidian'

interface TagModalOptions {
  title: string
  ctaLabel: string
  initialValue?: string
  /** Called with the trimmed value when the user confirms. */
  onSubmit: (value: string) => void | Promise<void>
}

/**
 * Small modal with a single text input, used by the settings tab to add a new
 * tag or rename an existing one. Enter confirms, Escape cancels.
 */
export class TagModal extends Modal {
  private value = ''
  private inputEl!: HTMLInputElement

  constructor(
    app: App,
    private opts: TagModalOptions,
  ) {
    super(app)
  }

  onOpen(): void {
    this.value = this.opts.initialValue ?? ''

    this.titleEl.setText(this.opts.title)

    new Setting(this.contentEl)
      .setName('Tag')
      .setDesc('A tag name without the #. Sub-tags work, e.g. todo/work.')
      .addText(text => {
        text
          .setValue(this.value)
          .setPlaceholder('e.g. todo')
          .onChange(v => (this.value = v))
        this.inputEl = text.inputEl
      })

    new Setting(this.contentEl)
      .addButton(btn =>
        btn.setButtonText('Cancel').onClick(() => this.close()),
      )
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

    // Focus after the modal is in the DOM.
    window.setTimeout(() => {
      this.inputEl.focus()
      this.inputEl.select()
    }, 0)
  }

  onClose(): void {
    this.contentEl.empty()
  }

  private async submit(): Promise<void> {
    const trimmed = this.value.trim()
    if (!trimmed) return
    await this.opts.onSubmit(trimmed)
    this.close()
  }
}
