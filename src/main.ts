import './style.css';
import { Game } from './Game';

const root = document.getElementById('app');
if (!root) throw new Error('boll: missing #app root element');

const game = new Game(root);
// Debug/tuning hook (harmless in production; used by tooling).
(window as unknown as { __boll: Game }).__boll = game;

function loop(now: number): void {
  game.frame(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
