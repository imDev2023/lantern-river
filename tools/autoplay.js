// Plays a run the way a phone player does: by dragging a finger on the page.
// Paste into the page (agent-browser eval --stdin < tools/autoplay.js) after it loads.
// It reads window.__game to decide where to steer, then sends pointer events to the
// drag surface, so the run goes through the same input path as a person's.
// Set window.__autoplayGreedy = false before pasting to keep to the safe channel only.

(() => {
  const surface = document.getElementById('surface');
  const game = window.__game;
  const M = 1_000_000;
  const DRAG_METRES = 9; // src/game/input.ts
  const span = () => Math.min(window.innerWidth, window.innerHeight * 0.75);
  const greedy = window.__autoplayGreedy !== false;
  let x = window.innerWidth / 2;
  const y = window.innerHeight * 0.7;
  const fire = (type) =>
    surface.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true }));

  function want(st, world) {
    const k = Math.floor(st.s / (20 * M));
    if (greedy) {
      for (const kk of [k, k + 1]) {
        for (const sh of world.chunk(kk).shrines) {
          const ahead = sh.s - st.s;
          if (ahead > -2 * M && ahead < 9 * M) return sh.x - sh.side * 1.2 * M;
        }
      }
    }
    return world.channel(st.s + st.vs * 15);
  }

  fire('pointerdown');
  const timer = setInterval(() => {
    const st = game.state;
    if (game.mode === 'over' || st.phase !== 'run') {
      fire('pointerup');
      clearInterval(timer);
      return;
    }
    if (game.mode !== 'play') return;
    const dm = (want(st, game.world) - st.target) / M;
    const step = Math.max(-40, Math.min(40, (dm / DRAG_METRES) * span()));
    if (Math.abs(step) < 0.5) return;
    x += step;
    fire('pointermove');
  }, 16);
  window.__autoplayStop = () => {
    clearInterval(timer);
    fire('pointerup');
  };
  return 'autoplay started';
})();
