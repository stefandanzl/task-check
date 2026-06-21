import {Menu, Notice, TFile, type App} from 'obsidian'

import type {TodoItem} from 'src/_types'
import {
  ensureTaskBlockRef,
  getTaskDisplayText,
  navToFile,
  renderTaskHTML,
  setTodoDate,
  setTodoPriority,
  setTodoStatus,
} from 'src/utils'
import {TASK_STATES} from '../constants'
import {InputModal} from '../InputModal'

const copyToClipboard = async (text: string, msg = 'Copied') => {
  await navigator.clipboard.writeText(text)
  new Notice(msg)
}

// Plain readable text for a wikilink alias: rendered text with tags and any
// link-breaking symbols ([, ], |) stripped, whitespace collapsed.
const cleanTaskAlias = (html: string): string => {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  return text
    .replace(/#[^\s#]+/g, '')
    .replace(/[\[\]|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Builds and shows the native context menu for a task row. Priority/date
 * submenus only appear when their tag is configured. File edits propagate back
 * to the view via Obsidian's metadataCache refresh.
 */
export const openTaskContextMenu = (
  item: TodoItem,
  app: App,
  e: MouseEvent,
  priorityTag: string,
  dateTag: string,
) => {
  e.preventDefault()
  const menu = new Menu()
  const displayText = getTaskDisplayText(item, priorityTag, dateTag)
  const plainText = cleanTaskAlias(renderTaskHTML(item, app, priorityTag, dateTag)) || displayText

  menu.addItem(i =>
    i
      .setTitle('Copy task text')
      .setIcon('copy')
      .onClick(() => copyToClipboard(displayText)),
  )
  menu.addItem(i =>
    i
      .setTitle('Copy as plain text')
      .setIcon('text')
      .onClick(() => copyToClipboard(plainText, 'Plain text copied')),
  )
  menu.addItem(i =>
    i
      .setTitle('Copy as markdown')
      .setIcon('clipboard-list')
      .onClick(() =>
        copyToClipboard(`- [${item.taskStatus}] ${item.originalText}`, 'Markdown copied'),
      ),
  )
  menu.addItem(i =>
    i
      .setTitle('Copy link to task')
      .setIcon('link')
      .onClick(async () => {
        const id = await ensureTaskBlockRef(item, app)
        if (!id) return
        const file = app.vault.getAbstractFileByPath(item.filePath)
        if (!(file instanceof TFile)) return
        // sourcePath: the note the link is "stored in". For a clipboard copy we
        // don't know the destination, so use the active note when it differs
        // from the target (correct relative links), else the vault root. Never
        // the target's own path — that would collapse to [[#^id]].
        const activePath = app.workspace.getActiveFile()?.path
        const sourcePath = activePath && activePath !== item.filePath ? activePath : ''
        const link = app.fileManager.generateMarkdownLink(file, sourcePath, `#^${id}`, plainText)
        await copyToClipboard(link, 'Task link copied')
      }),
  )

  if (priorityTag) {
    menu.addSeparator()
    menu.addItem(i =>
      i
        .setTitle('Set priority…')
        .setIcon('flag')
        .onClick(() => {
          new InputModal(app, {
            title: 'Set priority',
            ctaLabel: 'Save',
            type: 'number',
            initialValue: item.priority != null ? String(item.priority) : '',
            placeholder: 'e.g. 2',
            onSubmit: async v => {
              const n = parseInt(v, 10)
              await setTodoPriority(item, n, priorityTag, app)
            },
          }).open()
        }),
    )
    menu.addItem(i =>
      i
        .setTitle('Clear priority')
        .setIcon('circle-slash')
        .onClick(() => setTodoPriority(item, null, priorityTag, app)),
    )
  }

  if (dateTag) {
    menu.addSeparator()
    menu.addItem(i =>
      i
        .setTitle('Set due date…')
        .setIcon('calendar')
        .onClick(() => {
          new InputModal(app, {
            title: 'Set due date',
            ctaLabel: 'Save',
            type: 'date',
            initialValue: item.dateTag ?? '',
            onSubmit: async v => {
              await setTodoDate(item, new Date(v), dateTag, app)
            },
          }).open()
        }),
    )
    menu.addItem(i =>
      i
        .setTitle('Clear due date')
        .setIcon('calendar-x')
        .onClick(() => setTodoDate(item, null, dateTag, app)),
    )
  }

  menu.addSeparator()
  menu.addItem(i => {
    i.setTitle('Set state').setIcon('square-check-big')
    // MenuItem.setSubmenu() exists at runtime but isn't in the typings.
    const sub = (i as unknown as {setSubmenu: () => Menu}).setSubmenu()
    for (const state of TASK_STATES) {
      sub.addItem(si =>
        si
          // .setTitle(`[${state.symbol}] ${state.label}`)
          .setTitle(`${state.label}`)
          .setIcon(state.icon)
          .setChecked(item.taskStatus === state.symbol)
          .onClick(() => setTodoStatus(item, state.symbol, app)),
      )
    }
  })

  menu.addSeparator()
  menu.addItem(i =>
    i
      .setTitle('Open in file')
      .setIcon('file-text')
      .onClick(() => navToFile(app, item.filePath, e, item.line)),
  )

  menu.showAtMouseEvent(e)
}
