// Steering from touch, mouse, keyboard and gamepad, as one target offset in metres.
// The page turns it into the rules' input once per tick (Recorder.steer), so only what
// reaches the rules is recorded, whichever device it came from.

export interface Controls {
  /** The target for the coming tick, in metres from the centre line, kept within `limit`. */
  target(limit: number): number;
  /** Read the gamepad; call once per frame, whatever the game is doing. */
  poll(): void;
  /** Put the target back on the centre line, for a new run. */
  reset(): void;
  /** Called on the first press of any kind: a tap, a click, a key or a gamepad button. */
  onAction(fn: () => void): void;
  /** Keyboard and gamepad commands. */
  onCommand(fn: (cmd: 'pause' | 'restart' | 'mute') => void): void;
}

/** Metres of steering for a drag across the narrower of the screen's width and 3/4 of its height. */
const DRAG_METRES = 9;
/** Metres per tick that a held key or a full stick moves the target. */
const KEY_RATE = 0.1;
const DEADZONE = 0.2;

export function createControls(surface: HTMLElement): Controls {
  let target = 0;
  let dragId: number | null = null;
  let lastX = 0;
  let pendingDrag = 0;
  const keys = new Set<string>();
  const actions: Array<() => void> = [];
  const commands: Array<(cmd: 'pause' | 'restart' | 'mute') => void> = [];
  const act = () => actions.forEach((fn) => fn());
  const command = (cmd: 'pause' | 'restart' | 'mute') => commands.forEach((fn) => fn(cmd));

  surface.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    act();
    dragId = e.pointerId;
    lastX = e.clientX;
    try {
      surface.setPointerCapture(e.pointerId);
    } catch {
      // The pointer can already be gone (or be synthetic); the drag still works without capture.
    }
  });
  surface.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragId) return;
    const span = Math.min(window.innerWidth, window.innerHeight * 0.75);
    pendingDrag += ((e.clientX - lastX) / span) * DRAG_METRES;
    lastX = e.clientX;
  });
  const release = (e: PointerEvent) => {
    if (e.pointerId === dragId) dragId = null;
  };
  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', release);

  const STEER_KEYS = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') command('pause');
    else if (e.code === 'KeyR') command('restart');
    else if (e.code === 'KeyM') command('mute');
    else if (STEER_KEYS.includes(e.code) || e.code === 'Space' || e.code === 'Enter') act();
    if (STEER_KEYS.includes(e.code)) {
      keys.add(e.code);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  let padButtons: boolean[] = [];
  let padX = 0;
  function readPad(): number {
    const pad = navigator.getGamepads?.().find((p) => p && p.connected);
    if (!pad) return 0;
    const pressed = pad.buttons.map((b) => b.pressed);
    const edge = (i: number) => pressed[i] && !padButtons[i];
    if (edge(0)) act();
    if (edge(9)) command('pause');
    if (edge(3)) command('restart');
    padButtons = pressed;
    let x = pad.axes[0] ?? 0;
    if (Math.abs(x) < DEADZONE) x = 0;
    if (pressed[14]) x = -1;
    if (pressed[15]) x = 1;
    if (x !== 0) act();
    return x;
  }

  return {
    target(limit) {
      let move = pendingDrag;
      pendingDrag = 0;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) move -= KEY_RATE;
      if (keys.has('ArrowRight') || keys.has('KeyD')) move += KEY_RATE;
      move += padX * KEY_RATE;
      target = Math.max(-limit, Math.min(limit, target + move));
      return target;
    },
    poll() {
      padX = readPad();
    },
    reset() {
      target = 0;
      pendingDrag = 0;
    },
    onAction(fn) {
      actions.push(fn);
    },
    onCommand(fn) {
      commands.push(fn);
    },
  };
}
