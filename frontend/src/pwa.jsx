import React, { useEffect, useRef, useState } from 'react';
export function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine !== false);
  const [install, setInstall] = useState(null);
  const [update, setUpdate] = useState(null);
  const reloadRequested = useRef(false);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia?.('(display-mode: standalone)').matches ||
      navigator.standalone === true,
  );
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false),
      prompt = (event) => {
        event.preventDefault();
        setInstall(event);
      },
      done = () => {
        setInstalled(true);
        setInstall(null);
      };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', done);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', done);
    };
  }, []);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let active = true;
    const changed = () => {
      if (reloadRequested.current && navigator.serviceWorker.controller)
        window.location.reload();
    };
    let refreshing = false;
    const receive = () => {
      if (refreshing || !reloadRequested.current) return;
      refreshing = true;
      changed();
    };
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        if (!active) return;
        if (reg.waiting) setUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (
              active &&
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            )
              setUpdate(worker);
          });
        });
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', receive);
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('controllerchange', receive);
    };
  }, []);
  const installApp = async () => {
    if (!install) return;
    await install.prompt();
    await install.userChoice;
    setInstall(null);
  };
  const applyUpdate = () => {
    reloadRequested.current = true;
    update?.postMessage({ type: 'SKIP_WAITING' });
  };
  if (online && !install && !update && (!isIOS || installed)) return null;
  return (
    <div className="pwa-status" role="region" aria-label="App status">
      {!online && (
        <p role="status">
          You’re offline. Reconnect before signing in, sending messages or
          submitting a quiz.
        </p>
      )}
      {update && (
        <div>
          <span>A new version is ready. Save your work before reloading.</span>{' '}
          <button onClick={applyUpdate}>Reload app</button>
        </div>
      )}
      {install && !installed && (
        <button onClick={installApp}>Install EduQuest</button>
      )}
      {isIOS && !installed && (
        <details>
          <summary>Install EduQuest on iPhone or iPad</summary>
          <p>Open this site in Safari, tap Share, then Add to Home Screen.</p>
        </details>
      )}
    </div>
  );
}
