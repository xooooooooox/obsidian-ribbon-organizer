// Full section re-renders empty and rebuild their container; depending on when the browser
// reflows, the nearest scrollable ancestor can clamp its scrollTop to 0 while the container is
// empty (observed on phones — the eye toggle snapped the list back to the top). Carrying the
// position across the rebuild explicitly removes that timing dependency.
export function withScrollPreserved(el: HTMLElement, render: () => void): void {
  let scroller: HTMLElement | null = el;
  while (scroller !== null && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
  if (scroller === null) {
    render(); // nothing scrollable up the tree — no position to preserve
    return;
  }
  const scrollTop = scroller.scrollTop;
  render();
  scroller.scrollTop = scrollTop;
}
