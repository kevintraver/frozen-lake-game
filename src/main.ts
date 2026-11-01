import './style.css';
import { Game } from './game';

const game = new Game(document.getElementById('app')!);
// Handy for debugging/playtesting in dev builds only.
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
