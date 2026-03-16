import {App, MarkdownView, Keymap} from 'obsidian'

import {ensureMdExtension, getFileFromPath} from './helpers'

export const navToFile = async (
  app: App,
  path: string,
  ev: MouseEvent,
  line?: number,
) => {
  path = ensureMdExtension(path)
  const file = getFileFromPath(app.vault, path)
  if (!file) return
  const mod = Keymap.isModEvent(ev)
  const leaf = app.workspace.getLeaf(mod)
  await leaf.openFile(file)
  if (line) {
    // Wait for editor to be ready
    await new Promise(resolve => setTimeout(resolve, 100))

    const view = app.workspace.getActiveViewOfType(MarkdownView)
    if (!view) return

    const editor = view.editor
    const lineContent = editor.getLine(line)
    const from = {line, ch: 0}
    const to = {line, ch: lineContent?.length ?? 0}

    // Center the line in view using Obsidian's scrollIntoView
    editor.scrollIntoView({from, to}, true)

    // Blink effect by temporarily selecting the line
    const originalSelection = editor.getSelection()
    editor.setSelection(from, to)

    // Clear selection after delay
    setTimeout(() => {
      editor.setCursor(to)
    }, 300)
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
