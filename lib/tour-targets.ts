/** Choose the rendered navigation item, never its hidden desktop/mobile twin. */
export function visibleTourTarget(id: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)).find(element =>
    element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
}

/** React may need to mount a view/tab before a target exists. No fixed sleep. */
export function waitForTourTarget(id: string, signal: AbortSignal): Promise<HTMLElement | undefined> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(undefined); return; }
    let frame = 0;
    const finish = (element?: HTMLElement) => {
      observer.disconnect(); clearTimeout(timeout); cancelAnimationFrame(frame);
      signal.removeEventListener('abort', abort); resolve(element);
    };
    const abort = () => finish();
    const check = () => {
      const element = visibleTourTarget(id);
      if (element) finish(element);
    };
    const observer = new MutationObserver(check);
    const timeout = window.setTimeout(() => finish(), 2000);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    signal.addEventListener('abort', abort, { once: true });
    frame = requestAnimationFrame(check);
  });
}
