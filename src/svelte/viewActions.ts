import type { Action } from "svelte/action";

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
