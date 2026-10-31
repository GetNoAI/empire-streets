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
