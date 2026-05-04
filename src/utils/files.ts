import {App, MarkdownView, Keymap, TFile, Notice} from 'obsidian'

import {ensureMdExtension, getFileFromPath} from './helpers'

export const navToFile = async (
  app: App,
  filePath: string,
  ev: MouseEvent,
  line?: number,
) => {
  // path = ensureMdExtension(path)
  // const file = getFileFromPath(app.vault, path)
  // if (!file) return
  const mod = Keymap.isModEvent(ev)
  const leaf = app.workspace.getLeaf(mod)
  const file = app.vault.getFileByPath(filePath)
  if (!file) {
    new Notice('File not found!')
    return
  }
  await leaf.openFile(file)
  if (line) {
    // Wait for editor to be ready
    // await new Promise(resolve => setTimeout(resolve, 100))

    const view = app.workspace.getActiveViewOfType(MarkdownView)
    if (!view) return

    const editor = view.editor
    const lineContent = editor.getLine(line)
    const from = {line, ch: 0}
    const to = {line, ch: lineContent?.length ?? 0}

    // 2. Explicitly set the Ephemeral State to trigger the "Search Match" logic
    leaf.setEphemeralState({
      line: line,
      focus: true,
    })

    setTimeout(() => {
      editor.setCursor(to)
    }, 5)

    function keydownCallback(ev: KeyboardEvent) {
      leaf.setEphemeralState({
        match: {
          content: '',
          matches: [],
        },
      })
      removeEventListener('keydown', keydownCallback)
    }

    addEventListener('keydown', keydownCallback)
  }
}

export const hoverFile = (event: MouseEvent, app: App, filePath: string) => {
  const targetElement = event.currentTarget
  const timeoutHandle = setTimeout(() => {
    app.workspace.trigger('link-hover', {}, targetElement, filePath, filePath)
  }, 800)
  targetElement.addEventListener('mouseleave', () => {
    clearTimeout(timeoutHandle)
  })
}
