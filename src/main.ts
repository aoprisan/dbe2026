import './style.css';
import { mount, renderOfficialLinks } from './render';
import { init as initNotifications } from './notify';
import { importPicksFromUrl } from './picks-link';
import { loadWallet } from './wallet';
import { initServiceWorker, renderBuildInfo } from './update';

// Import picks shared via a `#p=…` link before the first render so the app
// opens straight onto the shared line-up.
importPicksFromUrl();

const app = document.getElementById('app');
if (app) {
  mount(app);

  // Schedule set-start reminders for the user's picks (device-local).
  initNotifications();

  // Read any imported tickets off the device so the night headers can offer
  // them; the render subscribes and repaints when they arrive.
  void loadWallet();

  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.append('Unofficial fan-made night planner · not affiliated with the festival.');
  footer.appendChild(document.createElement('br'));
  footer.append('Line-up from the official posters; running order and times provisional.');
  footer.appendChild(document.createElement('br'));
  footer.append('Your picks are saved on this device only.');
  // The festival's own addresses, right under the line that says this planner
  // is not the festival — if the two ever disagree, theirs is the one that wins.
  footer.appendChild(renderOfficialLinks());
  // Which build is on this device, and a way to go and fetch a newer one
  // without waiting for the service worker to notice on its own.
  footer.appendChild(renderBuildInfo());
  app.appendChild(footer);
}

// ---- PWA install prompt ----
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installBtn = document.getElementById('install-btn') as HTMLButtonElement | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as BeforeInstallPromptEvent;
  installBtn?.classList.add('show');
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.remove('show');
});

window.addEventListener('appinstalled', () => {
  installBtn?.classList.remove('show');
});

// ---- service worker ----
initServiceWorker();
