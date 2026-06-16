import {Menu, Notice, type App} from 'obsidian'

import type {TodoItem} from 'src/_types'
import {
  ensureTaskBlockRef,
  navToFile,
  setTodoDate,
  setTodoPriority,
  toggleTodoItem,
} from 'src/utils'
import {splitBlockRef} from 'src/utils/helpers'
import {InputModal} from '../InputModal'

const copyToClipboard = async (text: string, msg = 'Copied') => {
  await navigator.clipboard.writeText(text)
  new Notice(msg)
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

  menu.addItem(i =>
    i
      .setTitle('Copy task text')
      .setIcon('copy')
      .onClick(() => copyToClipboard(splitBlockRef(item.originalText).body)),
  )
  menu.addItem(i =>
    i
      .setTitle('Copy as markdown')
      .setIcon('clipboard-list')
      .onClick(() =>
        copyToClipboard(`- [${item.checked ? 'x' : ' '}] ${item.originalText}`, 'Markdown copied'),
      ),
  )
  menu.addItem(i =>
    i
      .setTitle('Copy link to task')
      .setIcon('link')
      .onClick(async () => {
        const id = await ensureTaskBlockRef(item, app)
        if (!id) return
        const alias = splitBlockRef(item.originalText).body
        await copyToClipboard(`[[${item.fileLabel}^${id}|${alias}]]`, 'Task link copied')
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
  menu.addItem(i =>
    i
      .setTitle(item.checked ? 'Mark incomplete' : 'Mark complete')
      .setIcon(item.checked ? 'circle' : 'check-circle')
      .onClick(() => toggleTodoItem(item, app)),
  )
  menu.addItem(i =>
    i
      .setTitle('Open in file')
      .setIcon('file-text')
      .onClick(() => navToFile(app, item.filePath, e, item.line)),
  )

  menu.showAtMouseEvent(e)
}
