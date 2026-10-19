// Owner-controlled capture utilities; these do not implement runtime layout or timers.
export function viewport(lines: string[], terminalRows: number, requestedOffset = 0) {
  const count = Math.max(1, terminalRows - 4);
  const offset = Math.min(Math.max(0, requestedOffset), Math.max(0, lines.length - count));
  return { offset, rows: lines.slice(offset, offset + count), totalLines: lines.length };
}

export function createCaptureExecution<T>(component: {
  stopAnimation(): void;
  updateResult(value: T, partial: boolean): void;
}) {
  const controller = new AbortController();
  let active = true;
  let lateUpdates = 0;
  return {
    signal: controller.signal,
    get active() {
      return active;
    },
    get lateUpdates() {
      return lateUpdates;
    },
    update(value: T) {
      if (!active) {
        lateUpdates++;
        return;
      }
      component.updateResult(value, true);
    },
    complete() {
      if (!active) return;
      active = false;
      component.stopAnimation();
    },
    retire(reason: 'cancel' | 'context-replacement' | 'shutdown') {
      if (!active) return;
      active = false;
      component.stopAnimation();
      controller.abort(new DOMException(reason, 'AbortError'));
    },
  };
}
