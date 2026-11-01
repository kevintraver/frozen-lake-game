# Frozen Lake

Hop an animal across a frozen lake before the ice cracks beneath you. Built with [three.js](https://threejs.org), Vite and TypeScript.

## Play

```bash
npm install
npm run dev
```

Then open the URL Vite prints. `npm run build` produces a static site in `dist/`.

## How it works

- Pick a **Penguin**, **Fox** or **Bear** on the shore. Use ←/→ and Enter, or click or tap an animal.
- Hop tile by tile across a 9 × 20 lake with the arrow keys or WASD (swipe on touch screens).
- About 20% of the lake starts as open holes. Every layout is random, but a path across always exists.
- Ice starts cracking the moment you land on it and breaks after a short time, **even if you're still standing on it**. Keep moving.
- Fall in and you get a splash and a fresh lake. Reach the far shore to win.

| Animal  | Ice lasts | Hop speed | Special |
|---------|-----------|-----------|---------|
| Penguin | 1.6s      | slow      | light-footed |
| Fox     | 1.0s      | fast      | — |
| Bear    | 0.6s      | medium    | hold **Shift** (or long-swipe) to leap 2 tiles; the hard landing cracks the ice instantly |

Press **M** to mute.

## Tuning

All gameplay numbers live in [`src/config.ts`](src/config.ts): lake size, hole chance, per-animal crack and hop times, leap behavior.

## Code map

- `src/game.ts` – game loop, modes (select / playing / falling / won / lost), input, camera, effects
- `src/lake.ts` – ice tiles, crack visuals and break timing
- `src/generate.ts` – random layout with a guaranteed path (BFS)
- `src/animals.ts` – low-poly animals built from primitives
- `src/scenery.ts` – snowy banks and trees
- `src/audio.ts` – synthesized Web Audio sound effects
