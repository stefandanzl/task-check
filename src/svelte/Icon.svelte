<script lang="ts">
  import type { Icon } from "src/_types"

  let {
    name,
    direction = "down",
    style = "static",
  }: {
    name: Icon
    direction?: "up" | "down" | "left" | "right"
    style?: "static" | "button"
  } = $props()

</script>

{#if name === "chevron"}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg 
    class={`svg-icon lucide-chevron-down svg-chevron ${direction} ${style}`}
    focusable="false"
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    stroke-width="2" 
    stroke-linecap="round" 
    stroke-linejoin="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
{/if}

<style>
  .svg-chevron {
    width: var(--checklist-iconSize);
    height: var(--checklist-iconSize);
    transition: transform 150ms ease;
    cursor: pointer;
  }

  .up {
    transform: rotate(180deg);
  }
  .down {
    transform: rotate(0deg);
  }
  .left {
    transform: rotate(90deg);
  }
  .right {
    transform: rotate(270deg);
  }

  .button {
    fill: var(--checklist-iconFill--accent);
    transition: fill 150ms ease;
  }

  .button:hover {
    fill: var(--checklist-textColor);
  }

    /* .static {
    fill: var(--checklist-iconFill);
  } */
</style>
