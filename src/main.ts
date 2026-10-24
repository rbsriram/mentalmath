import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { app } from './lib/app.svelte';

mount(App, { target: document.getElementById('app')! });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
  // A controller change while this page is already controlled means a new
  // worker took over. Outside a run every answer is already saved, so the
  // page reloads into the new build at once; during a run it only offers
  // the reload. The flag makes it fire once.
  const wasControlled = navigator.serviceWorker.controller !== null;
  let seen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (wasControlled && !seen) {
      seen = true;
      if (app.running) app.updateReady = true;
      else location.reload();
    }
  });
}
