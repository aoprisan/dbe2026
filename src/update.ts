/**
 * Build stamp and manual update control.
 *
 * The planner is a service-worker-backed PWA, which is exactly what you want on
 * a hillside in Alba Iulia with no signal — and exactly what gets in the way
 * when a set time changes an hour before doors and the phone is still holding
 * yesterday's copy. The worker updates on its own, but "on its own" can mean
 * the next cold start, so this module gives the footer two plain things: which
 * build is on the device, and a button that goes and gets a newer one now.
 */
import { registerSW } from 'virtual:pwa-register';
import { DATA_VERSION } from './data';

/** ISO instant this bundle was built (injected at build time). */
const BUILD_TIME = __BUILD_TIME__;
/** Short commit this bundle was built from, when known. */
const BUILD_COMMIT = __BUILD_COMMIT__;

/** How long to wait for a found update to take over before reloading anyway. */
const HANDOVER_TIMEOUT_MS = 6000;
/** How long the reachability probe waits before calling the network a loss. */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Register the service worker. `registerType: 'autoUpdate'` means a newly
 * installed worker skips waiting and the page reloads itself the moment it
 * takes over, so there is no prompt to wire up here — only the registration.
 */
export function initServiceWorker(): void {
  registerSW({ immediate: true });
}

/** The build stamp in the reader's own timezone, e.g. "31 Jul 2026, 18:04". */
function buildLabel(): string {
  const built = new Date(BUILD_TIME);
  if (Number.isNaN(built.getTime())) return 'unknown';
  return built.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** The detail behind the stamp, hung off the title attribute. */
function buildDetail(): string {
  const parts = [`Built ${BUILD_TIME}`];
  if (BUILD_COMMIT) parts.push(`commit ${BUILD_COMMIT}`);
  parts.push(`line-up data ${DATA_VERSION}`);
  return parts.join(' · ');
}

/**
 * Drop every Cache Storage entry so the reload that follows is answered by the
 * network. Only picks up the app's own asset caches — picks, tickets, journal
 * and crew all live in localStorage and are untouched.
 */
async function purgeCaches(): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    // A locked-down browser can refuse; the reload is still worth doing.
  }
}

async function currentRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  try {
    return await navigator.serviceWorker.getRegistration();
  } catch {
    return undefined;
  }
}

/**
 * Is the site actually reachable right now?
 *
 * This has to be asked out loud, because the obvious proxy for it lies:
 * `registration.update()` resolves rather than rejects when the update fetch
 * fails, so a failed check is indistinguishable from "you already have the
 * newest build". Believing the lie would mean dropping the caches and reloading
 * a phone with no signal into a blank page — the one thing an offline-first
 * planner must never do. So: one cache-busting request that has to come back
 * from the network before anything is thrown away.
 */
async function serverReachable(): Promise<boolean> {
  if (navigator.onLine === false) return false;
  const probe = new URL(document.baseURI);
  probe.hash = '';
  probe.searchParams.set('_probe', String(Date.now()));
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(probe, { cache: 'no-store', signal: abort.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/* ---------- the footer widget ---------- */

/** Reports progress into the line under the button. */
type Say = (message: string, warn?: boolean) => void;

/**
 * The build line and its update button. One press has three possible endings:
 * a newer build was found and the page reloads onto it; there is nothing newer,
 * so the device is reset to a clean copy of the current build anyway (the
 * "force" part, and the repair for a cache that went bad); or the site cannot
 * be reached, where the honest move is to leave the offline copy alone and say
 * so rather than reload a phone with no signal into a blank page.
 */
export function renderBuildInfo(): HTMLElement {
  const wrap = document.createElement('p');
  wrap.className = 'footer-build';

  const stamp = document.createElement('span');
  stamp.className = 'build-stamp';
  stamp.textContent = `Build ${buildLabel()}`;
  stamp.title = buildDetail();
  wrap.appendChild(stamp);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-ghost btn-update';
  btn.textContent = '↻ Force update';
  btn.title = 'Fetch the latest build now';
  wrap.appendChild(btn);

  const status = document.createElement('span');
  status.className = 'build-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  wrap.appendChild(status);

  const say: Say = (message, warn = false) => {
    status.textContent = message;
    status.hidden = false;
    status.classList.toggle('is-warn', warn);
  };

  let running = false;
  btn.addEventListener('click', () => {
    if (running) return;
    running = true;
    btn.disabled = true;
    say('Checking…');
    void forceUpdate(say).finally(() => {
      // Only a failed check lands here with the page still standing; the other
      // paths are on their way into a reload.
      running = false;
      btn.disabled = false;
    });
  });

  return wrap;
}

/**
 * Check for a newer build and reload onto it. Resolves only when nothing was
 * done (an unreachable network); the successful paths end in a page reload.
 */
async function forceUpdate(say: Say): Promise<void> {
  const reg = await currentRegistration();

  if (reg) {
    try {
      await reg.update();
    } catch {
      // Ignore: the reachability probe below is the one that decides, since a
      // resolved update() proves nothing (see serverReachable).
    }

    if (reg.installing || reg.waiting) {
      // A newer worker is on its way in, and it has its own copy of the new
      // assets — so this path never touches the caches. The registration
      // reloads the page as the new worker takes over; the timer is only there
      // for a hand-over that stalls.
      say('Newer build found — reloading…');
      window.setTimeout(() => window.location.reload(), HANDOVER_TIMEOUT_MS);
      return;
    }
  }

  if (!(await serverReachable())) {
    say('Can’t reach the network — kept the copy on this device.', true);
    return;
  }

  // Nothing newer to install: either this is already the latest build, or there
  // is no worker at all (the dev server, or a browser with them switched off).
  // The network is answering, so take the app back to first principles —
  // caches dropped, worker unregistered, page reloaded from the server. On the
  // way back up the registration installs a new worker that precaches the lot,
  // which is also how a precache half-written on a bad connection gets repaired.
  //
  // The order matters: the worker has to go before the reload, or the reload is
  // answered by the same worker whose caches were just emptied and the device
  // is left with no offline copy at all.
  say('Already the latest build — reloading it fresh…');
  await purgeCaches();
  if (reg) {
    try {
      await reg.unregister();
    } catch {
      // Nothing to do about it; the reload below is still the right move.
    }
  }
  window.location.reload();
}
