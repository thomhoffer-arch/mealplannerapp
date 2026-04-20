// Registers the service worker. The worker is configured to skipWaiting on
// install, so each new deploy activates itself, fires controllerchange on
// every open tab, and triggers the auto-reload below. Users never get
// stranded on stale JS. The 'sw-update-ready' event is still fired for any
// UI that wants to flash a "new version" notice before the reload happens.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then((registration) => {
        const notifyIfWaiting = (worker) => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(
              new CustomEvent('sw-update-ready', { detail: registration }),
            );
          }
        };

        if (registration.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(
            new CustomEvent('sw-update-ready', { detail: registration }),
          );
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () =>
            notifyIfWaiting(newWorker),
          );
        });

        // Check for a new worker whenever the tab becomes visible — iOS
        // Safari in particular can sit on an old worker for hours
        // otherwise. Also poll every 10 min as a safety net.
        const checkForUpdate = () => registration.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });
        setInterval(checkForUpdate, 10 * 60 * 1000);
      })
      .catch((err) => console.log('SW registration failed:', err));

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
