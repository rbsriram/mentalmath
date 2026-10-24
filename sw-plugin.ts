// Emits dist/sw.js after a production build. The worker precaches the
// emitted asset list under a hash-named cache, serves navigations offline,
// and falls back to the network for anything else.

import { createHash } from 'node:crypto';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

export function serviceWorkerPlugin(): Plugin {
  return {
    name: 'mentalmath-sw',
    apply: 'build',
    writeBundle(options, bundle) {
      const base = process.env.BASE_PATH ?? '/';
      const names = ['./'];
      for (const file of Object.keys(bundle)) {
        if (file === 'sw.js') continue;
        names.push('./' + file);
      }
      // Public-dir files are copied beside the bundle, not listed in it.
      try {
        for (const file of readdirSync(join(process.cwd(), 'public'))) {
          names.push('./' + file);
        }
      } catch {
        // no public dir
      }
      const hash = createHash('sha256')
        .update(JSON.stringify(names))
        .digest('hex')
        .slice(0, 12);
      const sw = `// Precache + runtime fallback worker. Generated at build time.
const CACHE = 'mm-${hash}';
const ASSETS = ${JSON.stringify(names)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mm-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('${base}index.html').then((r) => r || fetch(e.request)),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: false }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});
`;
      writeFileSync(join(options.dir ?? 'dist', 'sw.js'), sw);
    },
  };
}
