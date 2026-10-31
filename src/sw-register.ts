export interface UpdateHandle {
  /** resolves when a new version is installed and waiting */
  onUpdate(cb: () => void): void;
  apply(): void;
}

export function registerServiceWorker(): UpdateHandle {
  let cb: (() => void) | undefined;
  let waiting: ServiceWorker | null = null;
  const handle: UpdateHandle = {
    onUpdate(fn) {
      cb = fn;
      if (waiting) fn();
    },
    apply() {
      waiting?.postMessage('SKIP_WAITING');
    },
  };
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return handle;

  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only reload for an update we asked for, never on the very first install.
    if (hadController) location.reload();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      const flag = (sw: ServiceWorker | null) => {
        if (sw && navigator.serviceWorker.controller) {
          waiting = sw;
          cb?.();
        }
      };
      flag(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw?.addEventListener('statechange', () => sw.state === 'installed' && flag(sw));
      });
    })
    .catch(() => undefined);
  return handle;
}
