import {App, MarkdownView, Keymap, TFile} from 'obsidian'

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
  if (!file) return
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

    if (file) {
      // 2. Explicitly set the Ephemeral State to trigger the "Search Match" logic
      leaf.setEphemeralState({
        line: line,
        focus: true,
      })
    }

    // Set cursor manually, because setEphemeralState wants it to be in front of selection or highlight
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
