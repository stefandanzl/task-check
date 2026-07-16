import {App, PluginSettingTab, type SettingDefinitionItem} from 'obsidian'

import type TodoPlugin from './main'
import {InputModal} from './InputModal'
import type {GroupByType, SortDirection} from './_types'

export interface TodoSettings {
  todoPageName: string[]
  showChecked: boolean
  showAllTodos: boolean
  showOnlyActiveFile: boolean
  autoRefresh: boolean
  groupBy: GroupByType
  subGroups: boolean
  sortDirectionItems: SortDirection
  sortDirectionGroups: SortDirection
  sortDirectionSubGroups: SortDirection
  includeFiles: string
  _collapsedSections: string[]
  _hiddenTags: string[]
  baseTagFirst: boolean
  priorityTag: string
  maxTasksPerGroup: number | null
  enableLimit: boolean
  _showSettingsPanel: boolean
  _searchQueries: string[]
  _restoreLastSearch: boolean
  prioGrouping: boolean
  dateTag: string
  dateGrouping: boolean
  showFamilyInSearch: boolean
}

export const DEFAULT_SETTINGS: TodoSettings = {
  todoPageName: ['todo'],
  showChecked: false,
  showAllTodos: false,
  showOnlyActiveFile: false,
  autoRefresh: true,
  subGroups: false,
  groupBy: 'tag',
  sortDirectionItems: 'created: new->old',
  sortDirectionGroups: 'created: new->old',
  sortDirectionSubGroups: 'created: new->old',
  includeFiles: '',
  _collapsedSections: [],
  _hiddenTags: [],
  baseTagFirst: true,
  priorityTag: 'prio',
  maxTasksPerGroup: 5,
  enableLimit: true,
  _showSettingsPanel: false,
  _searchQueries: [],
  _restoreLastSearch: false,
  prioGrouping: false,
  dateTag: 'date',
  dateGrouping: false,
  showFamilyInSearch: true,
}

const SORT_OPTIONS: Record<string, string> = {
  'created: new->old': 'Created: New → Old',
  'created: old->new': 'Created: Old → New',
  'a->z': 'Alphabet: A → Z',
  'z->a': 'Alphabet: Z → A',
  'modified: new->old': 'Modified: New → Old',
  'modified: old->new': 'Modified: Old → New',
}

export class TodoSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: TodoPlugin,
  ) {
    super(app, plugin)
  }

  /**
   * Route declarative control writes through the plugin's updateSettings so the
   * existing regroup/repaint logic runs after each change. (List mutations go
   * through updateSettings directly in their callbacks.)
   */
  async setControlValue(key: string, value: unknown): Promise<void> {
    await this.plugin.updateSettings({[key]: value} as Partial<TodoSettings>)
  }

  private get tags(): string[] {
    return this.plugin.getSettingValue('todoPageName')
  }

  private openAddTagModal(): void {
    new InputModal(this.app, {
      title: 'Add tag',
      ctaLabel: 'Add',
      type: 'text',
      onSubmit: async value => {
        const tags = [...this.tags]
        if (!tags.includes(value)) tags.push(value)
        await this.plugin.updateSettings({todoPageName: tags})
        this.update()
      },
    }).open()
  }

  private openEditTagModal(index: number): void {
    new InputModal(this.app, {
      title: 'Edit tag',
      ctaLabel: 'Save',
      type: 'text',
      initialValue: this.tags[index],
      onSubmit: async value => {
        const tags = [...this.tags]
        tags[index] = value
        await this.plugin.updateSettings({todoPageName: tags})
        this.update()
      },
    }).open()
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: 'list',
        heading: 'Tags to track',
        desc: 'Tags whose checklist items are collected into the sidebar. Sub-tags work too (e.g. todo/work). Click a tag to rename it. Leave the list empty to capture every checklist item in the vault.',
        emptyState:
          'No tags configured — every checklist item in the vault is captured.',
        addItem: {
          name: 'Add tag',
          action: () => this.openAddTagModal(),
        },
        onReorder: async (oldIndex, newIndex) => {
          const tags = [...this.tags]
          const [moved] = tags.splice(oldIndex, 1)
          tags.splice(newIndex, 0, moved)
          await this.plugin.updateSettings({todoPageName: tags})
          this.update()
        },
        onDelete: async idx => {
          const tags = [...this.tags]
          tags.splice(idx, 1)
          await this.plugin.updateSettings({todoPageName: tags})
          this.update()
        },
        items: this.tags.map(tag => ({
          name: `#${tag}`,
          searchable: false,
          action: (_el: HTMLElement, index: number) =>
            this.openEditTagModal(index),
        })),
      },
      {
        name: 'Show completed',
        desc: 'If enabled will show completed todos too.',
        control: {type: 'toggle', key: 'showChecked'},
      },
      {
        name: 'Show all todos in file',
        desc: 'Show all items in a file if the tag is present, or only items attached to the block where the tag is located. Only has an effect when tags are configured.',
        control: {type: 'toggle', key: 'showAllTodos'},
      },
      {
        name: 'Show only in active file',
        desc: 'Show only todos present in the currently active file.',
        control: {type: 'toggle', key: 'showOnlyActiveFile'},
      },
      {
        name: 'Show family relations in search results',
        desc: 'When a search matches a task, also show its family tree as dimmed, non-interactive context: all ancestors (including done ones) above, and open descendants below.',
        control: {type: 'toggle', key: 'showFamilyInSearch'},
      },
      {
        type: 'group',
        heading: 'Grouping & sorting',
        items: [
          {
            name: 'Group by',
            control: {
              type: 'dropdown',
              key: 'groupBy',
              options: {tag: 'Tag', page: 'Page'},
            },
          },
          {
            name: 'Item sort',
            desc: 'Time sorts are based on when files were created (Created) or last modified (Modified).',
            control: {
              type: 'dropdown',
              key: 'sortDirectionItems',
              options: SORT_OPTIONS,
            },
          },
          {
            name: 'Group sort',
            desc: 'Time sorts are based on when files were created (Created) or last modified (Modified).',
            control: {
              type: 'dropdown',
              key: 'sortDirectionGroups',
              options: SORT_OPTIONS,
            },
          },
          {
            name: 'Base tag first',
            desc: 'Only applies when grouping by tag. If enabled base tags (e.g. #home) list before all its subtags (e.g. #home/kitchen) → (eg. #home, #work, #home/kitchen, #work/dev). \nIf disabled, sorting order will behave naturally without overriding the position of base tag item group to be at the top (eg. #home/kitchen, #work, #home, #work/dev).',
            control: {type: 'toggle', key: 'baseTagFirst'},
          },
          {
            name: 'Max tasks per group when limit activated',
            desc: 'Maximum tasks shown per group before the "Show all" button appears. 0 shows all tasks. Only takes effect when the limit is toggled on in the sidebar.',
            control: {type: 'number', key: 'maxTasksPerGroup', min: 0},
          },
        ],
      },
      {
        type: 'group',
        heading: 'Priority',
        items: [
          {
            name: 'Priority tag name',
            desc: 'Tag name for priority values. Tasks can use #tag/N format (e.g., #prio/2). Leave empty to disable priority sorting.',
            control: {
              type: 'text',
              key: 'priorityTag',
              placeholder: 'prio',
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Date',
        items: [
          {
            name: 'Date tag name',
            desc: 'Tag name for due dates. Tasks can use #tag/YYYY-MM-DD format (e.g., #date/2026-04-30). Leave empty to disable date features.',
            control: {
              type: 'text',
              key: 'dateTag',
              placeholder: 'date',
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Advanced',
        items: [
          {
            name: 'Include files',
            desc: 'Include all files that match this glob pattern. Examples on the plugin page/github readme. Leave empty to check all files.',
            control: {
              type: 'text',
              key: 'includeFiles',
              placeholder: '**/*',
            },
          },
          {
            name: 'Auto refresh list',
            desc: 'Recommended to leave on unless you experience performance issues with a large vault. You can then reload manually using the "Checklist: refresh" command.',
            control: {type: 'toggle', key: 'autoRefresh'},
          },
        ],
      },
    ]
  }
}
