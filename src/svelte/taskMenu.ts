import {Menu, moment, Notice, TFile, type App} from 'obsidian'

import type {TodoGroup, TodoItem, TaskPatch} from 'src/_types'
import {
  ensureTaskBlockRef,
  getTaskDisplayText,
  navToFile,
  setTodoDate,
  setTodoPrioritiesBatch,
  setTodoPriority,
  setTodoStatus,
} from 'src/utils'
import {DONE_TASK_SYMBOLS, TASK_STATES} from '../constants'
import {InputModal} from '../InputModal'
import {collectFamilyTree, copyFamilyAsMarkdown, filterListToTag, filterListToTask} from './viewActions'

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
  taskEl: HTMLElement | undefined,
  app: App,
  e: MouseEvent,
  priorityTag: string,
  dateTag: string,
  onPatch: (patch: TaskPatch) => void,
) => {
  e.preventDefault()
  const menu = new Menu()
  const displayText = getTaskDisplayText(item, priorityTag, dateTag)
  // const plainText = cleanTaskAlias(getTaskDisplayText(item, priorityTag, dateTag)) || displayText
  const plainText = taskEl?.textContent || displayText

  menu.addItem(i => {
    i.setTitle('Copy…').setIcon('copy-plus')
    // MenuItem.setSubmenu() exists at runtime but isn't in the typings.
    const sub = (i as unknown as {setSubmenu: () => Menu}).setSubmenu()

    sub.addItem(i =>
      i
        .setTitle('Copy task text')
        .setIcon('copy')
        .onClick(() => copyToClipboard(displayText)),
    )
    sub.addItem(i =>
      i
        .setTitle('Copy as plain text')
        .setIcon('text')
        .onClick(() => copyToClipboard(plainText, 'Plain text copied')),
    )
    sub.addItem(i =>
      i
        .setTitle('Copy as markdown')
        .setIcon('clipboard-list')
        .onClick(() =>
          copyToClipboard(`- [${item.taskStatus}] ${item.originalText}`, 'Markdown copied'),
        ),
    )
    sub.addItem(i =>
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
    // Only meaningful when the task actually has family (parent or children) —
    // standalone tasks would just copy themselves.
    if (item.family !== null) {
      sub.addItem(i =>
        i
          .setTitle('Copy family as markdown')
          .setIcon('list-tree')
          .onClick(() => copyFamilyAsMarkdown(item)),
      )
    }
  })





  menu.addSeparator()
  menu.addItem(i => {
    i.setTitle('Set state').setIcon('square-check-big')
    // MenuItem.setSubmenu() exists at runtime but isn't in the typings.
    const sub = (i as unknown as {setSubmenu: () => Menu}).setSubmenu()
    for (const state of TASK_STATES) {
      if (!DONE_TASK_SYMBOLS.has(state.symbol)){
        sub.addItem(si =>
          si
            // .setTitle(`[${state.symbol}] ${state.label}`)
            .setTitle(`${state.label}`)
            .setIcon(state.icon)
            .setChecked(item.taskStatus.toLowerCase() === state.symbol.toLowerCase())
            .onClick(() => {
              setTodoStatus(item, state.symbol, app)
              onPatch({taskStatus: state.symbol})
            }),
        )
      }
    }
    sub.addSeparator()
    for (const state of TASK_STATES) {
      if (DONE_TASK_SYMBOLS.has(state.symbol)){
        sub.addItem(si =>
          si
            // .setTitle(`[${state.symbol}] ${state.label}`)
            .setTitle(`${state.label}`)
            .setIcon(state.icon)
            .setChecked(item.taskStatus.toLowerCase() === state.symbol.toLowerCase())
            .onClick(() => {
              setTodoStatus(item, state.symbol, app)
              onPatch({taskStatus: state.symbol})
            }),
        )
      }
    }
  })

  menu.addItem(i =>
    i
      .setTitle('Clear state')
      .setIcon('square') // alternative: task-open
      .onClick(() => {
        setTodoStatus(item, ' ' , app)
        onPatch({taskStatus: ' '})
      }),
  )
  menu.addItem(i =>
    i
      .setTitle('Set done')
      .setIcon('check')
      .onClick(() => {
        setTodoStatus(item, 'x', app)
        onPatch({taskStatus: 'x'})
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
            quickButtons: [
              {
                label: '-1',
                onClick: async () => {
                  const n = (item.priority ?? 0) - 1
                  await setTodoPriority(item, n, priorityTag, app)
                  onPatch({priority: n})
                },
              },
              {
                label: 'Clear',
                onClick: async () => {
                  await setTodoPriority(item, null, priorityTag, app)
                  onPatch({priority: null})
                },
              },
              {
                label: '+1',
                onClick: async () => {
                  const n = (item.priority ?? 0) + 1
                  await setTodoPriority(item, n, priorityTag, app)
                  onPatch({priority: n})
                },
              },
            ],
            onSubmit: async v => {
              const n = v === '' ? null : parseInt(v, 10)
              await setTodoPriority(item, n, priorityTag, app)
              onPatch({priority: n})
            },
            // Overwrites the priority of EVERY family member (incl. done ones).
            // Empty input = remove the priority from all members.
            ...(item.family !== null && {
              altButton: {
                label: 'All family members',
                onSubmit: async v => {
                  const n = v === '' ? null : parseInt(v, 10)
                  await setTodoPrioritiesBatch(
                    collectFamilyTree(item).map(t => ({item: t, newPriority: n})),
                    priorityTag,
                    app,
                  )
                  onPatch({priority: n})
                },
              },
            }),
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
            type: 'datetime',
            initialValue: item.dateTag?.split(' ')[0] ?? '',
            initialTime: item.dateTag?.split(' ')[1] ?? '',
            onSubmit: async v => {
              const m = moment(v, ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD'], true)
              if (!m.isValid()) return
              const hasTime = v.includes(':')
              if (!hasTime) m.hour(12) // date-only default
              const d = m.toDate()
              await setTodoDate(item, d, dateTag, app, hasTime)
              onPatch({date: d})
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
      .setTitle('Filter list to this task')
      .setIcon('filter')
      .onClick(() => filterListToTask(item, app)),
  )
  menu.addItem(i =>
    i
      .setTitle('Open in file')
      .setIcon('file-text')
      .onClick(() => navToFile(app, item.filePath, e, item.line)),
  )

  menu.showAtMouseEvent(e)
}



  // Tag-group headers only: right-click → filter the list to this tag.
  export const handleHeaderContextMenu = (group: TodoGroup, app: App, e: MouseEvent ) => {
    if (group.type !== 'tag' || !group.mainTag) return
    e.preventDefault()
    const fullTag = group.subTags ? `#${group.mainTag}/${group.subTags}` : `#${group.mainTag}`
    const menu = new Menu()
    menu.addItem(i =>
      i
        .setTitle('Filter list to this tag')
        .setIcon('filter')
        .onClick(() => filterListToTag(fullTag, app)),
    )
    menu.showAtMouseEvent(e)
  }