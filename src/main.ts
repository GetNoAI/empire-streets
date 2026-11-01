import './style.css';
import { Game } from './core/Game';

const container = document.getElementById('app');
if (!container) throw new Error('#app missing');

const game = new Game(container);
game.init().catch((err: unknown) => {
  console.error(err);
  const msg = document.getElementById('load-msg');
  if (msg) msg.textContent = `Could not start: ${err instanceof Error ? err.message : String(err)}`;
});

// Exposed for debugging from the browser console.
(window as unknown as { game: Game }).game = game;

// Installable and playable offline (Add to Home Screen on a phone): the service worker caches the
// game once it has been loaded. Only on a built, served copy (not the dev server).
if ('serviceWorker' in navigator && import.meta.env.PROD && !/EmpireStreets\//.test(navigator.userAgent)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
