import { MarkdownView, Editor, Notice, type ObsidianProtocolData } from "obsidian";
import { TODO_VIEW_TYPE } from "./constants";
import { StatusSuggestModal } from "./StatusSuggestModal";
import { undoLast } from "./undo";
import { haveTodosChanged, parseFile, setTaskStatusChar, wireFamilyAndInherited } from "./utils";
import type TodoPlugin from "./main";
import type TodoListView from "./view";

export async function setupCommands(this: TodoPlugin) {
	this.initLeaf();

	this.addCommand({
		id: "show-checklist-view",
		name: "Show Checklist Pane",
		callback: () => {
			const workspace = this.app.workspace;
			const views = workspace.getLeavesOfType(TODO_VIEW_TYPE);
			if (views.length === 0) {
				workspace
					.getRightLeaf(false)
					.setViewState({
						type: TODO_VIEW_TYPE,
						active: true,
					})
					.then(() => {
						const todoLeaf = workspace.getLeavesOfType(TODO_VIEW_TYPE)[0];
						workspace.revealLeaf(todoLeaf);
						workspace.setActiveLeaf(todoLeaf, true, true);
					});
			} else {
				views[0].setViewState({
					active: true,
					type: TODO_VIEW_TYPE,
				});
				workspace.revealLeaf(views[0]);
				workspace.setActiveLeaf(views[0], true, true);
			}
		},
	});
	this.addCommand({
		id: "refresh-checklist-view",
		name: "Refresh List",
		callback: () => {
			this.view.refresh();
		},
	});

	this.addCommand({
		id: "undo-last-task-action",
		name: "Undo last task action",
		callback: () => {
			void undoLast(this.app, true);
		},
	});

	this.addCommand({
		id: "text-helper",
		name: "Task text helper",
		icon: "wrap-text",
		callback: () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			const editor = view?.editor;

			if (!editor) return;

			// Get the first tag only
			const firstTag = this.settings.todoPageName[0]?.trim() ?? "";
			editor.replaceSelection(`#${firstTag}/`);

			const handleEnter = (event: KeyboardEvent) => {
				if (event.key === "Enter") {
					window.removeEventListener("keydown", handleEnter);

					// Add " - [ ] " after a short delay to ensure the newline is processed
					setTimeout(() => {
						editor.replaceSelection("- [ ] ");
					}, 10);
				}
			};
			// Add the event listener
			window.addEventListener("keydown", handleEnter);
		},
	});

	this.addCommand({
		id: "open-search",
		name: "Open search",
		icon: "list-todo",
		callback: async () => {
			await this.focusSearchInput();
		},
	});

	this.addCommand({
		id: "set-status-current-line",
		name: "Set status for selected task line(s)",
		icon: "square-check-big",
		editorCallback: (editor: Editor) => {
			// Collect every checklist line covered by the current selection(s).
			// Non-checklist lines are skipped silently; a plain cursor (no selection)
			// collapses to the single line under it. Multi-cursor selections are
			// merged and deduped.
			const taskLines: number[] = [];
			const seen = new Set<number>();
			for (const sel of editor.listSelections()) {
				const from = Math.min(sel.anchor.line, sel.head.line);
				const to = Math.max(sel.anchor.line, sel.head.line);
				for (let l = from; l <= to; l++) {
					if (seen.has(l)) continue;
					seen.add(l);
					if (/^(\s|>)*([-*]|[0-9]+\.)\s\[([^\]]+)\]/.test(editor.getLine(l))) taskLines.push(l);
				}
			}
			if (taskLines.length === 0) {
				new Notice("Select a task line (- [ ]) first");
				return;
			}
			new StatusSuggestModal(this.app, (symbol) => {
				// Re-read each line at apply time in case it changed while the modal
				// was open; only the status char is swapped.
				for (const l of taskLines) {
					editor.setLine(l, setTaskStatusChar(editor.getLine(l), symbol));
				}
			}).open();
		},
	});

	// obsidian://taskcheck?search=<query> — opens the pane and runs the query.
	this.registerObsidianProtocolHandler("taskcheck", (data: ObsidianProtocolData) => {
		const raw = data.search;
		const search = raw && raw !== "true" ? raw : undefined;
		this.focusSearchInput(search);
	});
}

/**
 *  used by {@link "./view.ts"}
 */
export function setupEvents(this: TodoListView) {
	this.registerEvent(
		this.app.metadataCache.on("resolved", async () => {
			if (!this.plugin.getSettingValue("autoRefresh")) return;
			console.log("listener: resolved");
			await this.refresh();
		}),
	);

	/**
	*  @todo    
    * Add one global RegExp constant and use it to make this actually not mess up file
    * inclusion rules

	this.registerEvent(
		this.app.metadataCache.on("changed", async (file, data, cache) => {
			// console.log(file.path)
			// if (isExcluded(file.path, this.includeRegex)) return
			const oldTodos = this.itemsByFile.get(file.path);
			console.log("listener: changed");
			const newTodos = await parseFile(
				file,
				cache,
				this.app.vault,
				this.todoTagArray.length === 0 ? ["*"] : this.visibleTodoTagArray,
				this.plugin.getSettingValue("showAllTodos"),
				this.plugin.getSettingValue("priorityTag"),
				this.plugin.getSettingValue("dateTag"),
			);

			if (!haveTodosChanged(oldTodos, newTodos)) {
				return;
			}

			if (newTodos.length === 0) {
				this.itemsByFile.delete(file.path);
			} else {
				this.itemsByFile.set(file.path, newTodos);
			}

			wireFamilyAndInherited(newTodos);
			this.itemsByFile.set(file.path, newTodos);
			this.groupItems();
			this.renderView();
		}),
	);
    */

	this.registerEvent(
		this.app.workspace.on("active-leaf-change", async () => {
			if (!this.plugin.getSettingValue("showOnlyActiveFile")) return;
			console.log("listener: active-leaf-change");
			await this.refresh();
		}),
	);

	this.registerEvent(this.app.vault.on("delete", (file) => this.deleteFile(file.path)));
}
