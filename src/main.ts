import './style.css';
import { mount } from './render';
import { init as initNotifications } from './notify';
import { importPicksFromUrl } from './picks-link';
import { registerSW } from 'virtual:pwa-register';

// Import picks shared via a `#p=…` link before the first render so the app
// opens straight onto the shared line-up.
importPicksFromUrl();

const app = document.getElementById('app');
if (app) {
  mount(app);

  // Schedule set-start reminders for the user's picks (device-local).
  initNotifications();

  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.append('Unofficial fan-made night planner · not affiliated with the festival.');
  footer.appendChild(document.createElement('br'));
  footer.append('Line-up from the official posters; running order and times provisional.');
  footer.appendChild(document.createElement('br'));
  footer.append('Your picks are saved on this device only.');
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
registerSW({ immediate: true });
