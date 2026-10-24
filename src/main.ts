import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { app } from './lib/app.svelte';

mount(App, { target: document.getElementById('app')! });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
  // A controller change while this page is already controlled means a new
  // worker took over: offer a reload, never force it. The flag makes it
  // fire once.
  const wasControlled = navigator.serviceWorker.controller !== null;
  let seen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (wasControlled && !seen) {
      seen = true;
      app.updateReady = true;
    }
  });
}
