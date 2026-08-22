import { Notice } from "obsidian";
import type { Action } from "svelte/action";

import type { TodoItem } from "src/_types";

/**
 * Svelte action: fires `onVisible` once the element comes within range of the
 * viewport (200px pre-render buffer for seamless scrolling), then stops
 * observing. Use to defer expensive per-row work (DOM construction, Obsidian
 * markdown rendering) until the row is actually near the viewport.
 *
 * Pass a stable callback (defined once in the script) — an inline arrow gets a
 * new identity per render, which would tear down and recreate the observer.
 */
export const renderWhenVisible: Action<HTMLElement, () => void> = (node, onVisible) => {
	const observer = new IntersectionObserver(
		([entry]) => {
			if (entry.isIntersecting) {
				onVisible();
				observer.disconnect(); // one-shot: never re-observe after rendering
			}
		},
		{
			rootMargin: "200px 0px 200px 0px",
		},
	);

	observer.observe(node);

	return {
		destroy() {
			observer.disconnect();
		},
	};
};

export const collectFamilyTree = (item: TodoItem): TodoItem[] => {
	let root = item;
	while (root.family?.parent) root = root.family.parent;

	const out: TodoItem[] = [];
	const add = (node: TodoItem) => {
		out.push(node);
		for (const child of node.family?.children ?? []) add(child);
	};
	add(root);

	out.sort((a, b) => (a.filePath === b.filePath ? a.line - b.line : a.filePath.localeCompare(b.filePath)));
	return out;
};

export const familyToMarkdown = (family: TodoItem[]): string =>
	family.map((t) => `${"    ".repeat(t.spacesIndented)}- [${t.taskStatus}] ${t.originalText}`).join("\n");

export const copyFamilyAsMarkdown = async (item: TodoItem): Promise<void> => {
	const family = collectFamilyTree(item);
	await navigator.clipboard.writeText(familyToMarkdown(family));
	new Notice(`Copied family as markdown (${family.length} task${family.length > 1 ? "s" : ""})`);
};
