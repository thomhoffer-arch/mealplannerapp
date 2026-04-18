// Registers the service worker and surfaces a "new version available" event
// when an updated worker is installed and waiting. The UpdateToast component
// listens for that event and lets the user apply the update.
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
