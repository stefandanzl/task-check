export function clickOutside(node, options?: { exclude?: HTMLElement }) {
  const handleClick = (event: MouseEvent) => {
    if (node && !node.contains(event.target) && !event.defaultPrevented) {
      if (options?.exclude && options.exclude.contains(event.target as Node)) {
        return
      }
      node.dispatchEvent(new CustomEvent('click_outside', node))
    }
  }

  document.addEventListener('mousedown', handleClick, true)

  return {
    destroy() {
      document.removeEventListener('mousedown', handleClick, true)
    },
  }
}
