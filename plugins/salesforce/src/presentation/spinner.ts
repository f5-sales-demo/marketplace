// One session-owned refresh driver; no timers in individual transcript components.
export function spinnerDriver() {
  let ui: { setWidget(key: string, factory: unknown): void } | undefined;
  let active = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let repaint: (() => void) | undefined;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    repaint = undefined;
    ui?.setWidget('salesforce-progress-refresh', undefined);
  };
  return {
    bind(context: { hasUI: boolean; ui: typeof ui }) {
      stop();
      active = 0;
      ui = context.hasUI ? context.ui : undefined;
    },
    start() {
      active++;
      if (!ui || timer) return;
      ui.setWidget('salesforce-progress-refresh', (tui: { requestRender(): void }) => {
        repaint = () => tui.requestRender();
        return { render: () => [], invalidate() {} };
      });
      timer = setInterval(() => repaint?.(), 80);
    },
    end() {
      active = Math.max(0, active - 1);
      if (!active) stop();
    },
    dispose() {
      active = 0;
      stop();
      ui = undefined;
    },
  };
}
