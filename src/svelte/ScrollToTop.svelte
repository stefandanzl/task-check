<script lang="ts">
  /**
   * Floating "scroll to top" button for the checklist sidepanel. Fades in once
   * the panel is scrolled past a threshold and is anchored to the bottom-right
   * of the scroll container, tracking the panel even when docked/resized.
   *
   * The scroll container is detected dynamically (nearest ancestor that
   * actually scrolls) rather than assumed, because Obsidian's scroll element
   * varies. Scroll events don't bubble, so we listen on `window` with capture,
   * which catches scrolls from any descendant scroller.
   */
  const SIZE = 34
  const MARGIN = 14
  const THRESHOLD = 140

  let rootEl = $state<HTMLElement | undefined>(undefined)
  let visible = $state(false)
  let scrollContainer = $state<HTMLElement | null>(null)

  function identifyScroller(from: HTMLElement): HTMLElement | null {
    let node: HTMLElement | null = from.parentElement
    while (node && node !== document.body) {
      const oy = getComputedStyle(node).overflowY
      if (
        (oy === 'auto' || oy === 'scroll') &&
        node.scrollHeight > node.clientHeight
      ) {
        return node
      }
      node = node.parentElement
    }
    return null
  }

  $effect(() => {
    if (!rootEl) return
    let scroller: HTMLElement | null = null

    const update = () => {
      if (!scroller || !scroller.isConnected) {
        scroller = identifyScroller(rootEl)
      }
      scrollContainer = scroller
      if (!scroller) {
        visible = false
        return
      }
      visible = scroller.scrollTop > THRESHOLD
      const r = scroller.getBoundingClientRect()
    }

    update()
    // Scroll events don't bubble; capture on window catches them from any
    // descendant scroller (e.g. Obsidian's .view-content).
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)

    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  })

  function scrollToTop() {
    scrollContainer?.scrollTo({top: 0, behavior: 'smooth'})
  }
</script>

<div bind:this={rootEl} class="scroll-top-anchor">
  {#if visible && scrollContainer}
    <button
      type="button"
      class="scroll-top-button"
      style="left: 50%; top: 2%; transform: translateX(-50%);"
      onclick={scrollToTop}
      aria-label="Scroll to top"
      title="Scroll to top">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round">
        <path d="m5 12 7-7 7 7" />
        <path d="M12 19V5" />
      </svg>
    </button>
  {/if}
</div>

<style>
  .scroll-top-anchor {
    display: contents;
  }

  .scroll-top-button {
    position: fixed;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    box-shadow: var(--input-shadow);
    cursor: pointer;
    border: 1px solid var(--background-modifier-border);
    z-index: 50;
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }

  .scroll-top-button:hover {
    transform: scale(1.06);
  }

  .scroll-top-button svg {
    width: 24px;
    height: 24px;
  }
</style>
