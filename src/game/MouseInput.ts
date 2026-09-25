// MouseInput.ts
// Die Maus über dem Spielfeld, übersetzt in Absichten: Linksklick (mit
// Umschalt, Doppelklick), Auswahlrechteck, Rechtsklick, Karte mit rechter
// Taste ziehen, zoomen mit Mausrad oder Trackpad, Zeiger bewegt/verlassen.
// Was eine Absicht im Spiel bedeutet, entscheiden die MouseHandlers.

/** Eine Stelle auf dem Canvas in CSS-Pixeln. */
export interface CanvasPoint {
  x: number;
  y: number;
}

export interface MouseHandlers {
  /** Linke Taste gedrückt - true, wenn damit etwas passiert ist (Baumodus); dann kein Rechteck. */
  press(p: CanvasPoint): boolean;
  /** Linke Taste losgelassen - ob mit oder ohne Klick. */
  release(): void;
  /** Linksklick ohne Ziehen. `double`: zweiter Klick kurz hintereinander. */
  click(p: CanvasPoint, add: boolean, double: boolean): void;
  /** Rechteck aufgezogen (von a nach b). */
  box(a: CanvasPoint, b: CanvasPoint, add: boolean): void;
  /** Rechtsklick ohne Ziehen. */
  rightClick(p: CanvasPoint): void;
  /** Karte mit der rechten Taste gezogen: um (dx, dy) Pixel verschieben. */
  pan(dx: number, dy: number): void;
  /** Ziehen mit der rechten Taste beendet. */
  panEnd(): void;
  /** Eine Zoomstufe hinein (+1) oder hinaus (-1), um die Stelle p. */
  zoom(step: 1 | -1, p: CanvasPoint): void;
  /** Zeiger bewegt; `buttons` wie MouseEvent.buttons. */
  move(p: CanvasPoint, buttons: number): void;
  /** Zeiger hat das Canvas verlassen. */
  leave(): void;
}

/** Ab so vielen Pixeln Bewegung wird aus dem Klick ein Rechteck bzw. ein Ziehen. */
const DRAG_THRESHOLD = 5;
/**
 * Mausrad und Trackpad: jede Zoomstufe verdoppelt den Maßstab, also nicht je
 * Ereignis eine Stufe. Ein Mausrad schickt je Raste ein Ereignis (~100 px),
 * ein Trackpad beim Wischen Dutzende kleine samt Nachschwung - gesammelt
 * wird bis etwa eine Raste, dann eine Stufe und kurz Ruhe, damit der
 * Nachschwung nicht weiterzoomt. Zusammenziehen/Spreizen (Pinch, kommt als
 * Rad mit Strg) zählt stärker.
 */
const WHEEL_STEP = 100;
const WHEEL_PAUSE = 220;

export class MouseInput {
  private drag: { x: number; y: number; active: boolean } | null = null;
  /**
   * Rechte Taste: gedrückt halten und ziehen verschiebt die Karte (wie WASD),
   * kurz klicken ist ein Befehl. Entschieden wird erst beim Loslassen - das
   * Kontextmenü-Ereignis kommt auf dem Mac schon beim Drücken.
   */
  private rightDrag: { x: number; y: number; moved: boolean } | null = null;
  private wheelSum = 0;
  private wheelLast = 0;
  private wheelLocked = 0;

  /** @param box das Auswahlrechteck (ein absolut platziertes Element) */
  constructor(private canvas: HTMLCanvasElement, private box: HTMLElement, private handlers: MouseHandlers) {
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => this.down(e));
    // Auf window statt canvas: Rechteck und Ziehen dürfen über Panels und den
    // Rand hinaus gehen, ohne hängen zu bleiben.
    window.addEventListener('mousemove', (e) => this.windowMove(e));
    window.addEventListener('mouseup', (e) => this.up(e));
    canvas.addEventListener('mousemove', (e) => handlers.move(this.point(e), e.buttons));
    canvas.addEventListener('mouseleave', () => handlers.leave());
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
  }

  /** Stelle des Ereignisses auf dem Canvas in CSS-Pixeln. */
  point(e: MouseEvent): CanvasPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private down(e: MouseEvent) {
    if (e.button === 2) {
      this.rightDrag = { x: e.clientX, y: e.clientY, moved: false };
      return;
    }
    if (e.button !== 0) return;
    const p = this.point(e);
    if (this.handlers.press(p)) return;
    this.drag = { x: p.x, y: p.y, active: false };
  }

  private windowMove(e: MouseEvent) {
    if (this.drag) {
      const p = this.point(e);
      const drag = this.drag;
      if (!drag.active && Math.hypot(p.x - drag.x, p.y - drag.y) < DRAG_THRESHOLD) return;
      drag.active = true;
      const style = this.box.style;
      this.box.hidden = false;
      style.left = `${Math.min(p.x, drag.x)}px`;
      style.top = `${Math.min(p.y, drag.y)}px`;
      style.width = `${Math.abs(p.x - drag.x)}px`;
      style.height = `${Math.abs(p.y - drag.y)}px`;
    }
    const right = this.rightDrag;
    if (right && e.buttons & 2) {
      const dx = e.clientX - right.x;
      const dy = e.clientY - right.y;
      if (!right.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      right.moved = true;
      this.canvas.style.cursor = 'grabbing';
      // Die Karte folgt der Maus: die Kamera geht in die Gegenrichtung.
      this.handlers.pan(-dx, -dy);
      right.x = e.clientX;
      right.y = e.clientY;
    }
  }

  private up(e: MouseEvent) {
    if (e.button === 2 && this.rightDrag) {
      const moved = this.rightDrag.moved;
      this.rightDrag = null;
      if (moved) this.handlers.panEnd();
      else if (e.target === this.canvas) this.handlers.rightClick(this.point(e));
      return;
    }
    if (e.button !== 0) return;
    this.handlers.release();
    if (!this.drag) return;
    const p = this.point(e);
    if (this.drag.active) this.handlers.box(this.drag, p, e.shiftKey);
    // e.detail zählt die Klicks kurz hintereinander - 2 ist ein Doppelklick.
    else this.handlers.click(p, e.shiftKey, e.detail >= 2);
    this.drag = null;
    this.box.hidden = true;
  }

  private wheel(e: WheelEvent) {
    e.preventDefault();
    const now = performance.now();
    // Zeilen bzw. Seiten (Firefox mit Mausrad) in Pixel umrechnen.
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
    const delta = e.deltaY * unit * (e.ctrlKey ? 4 : 1);
    // Nach längerer Pause oder in die andere Richtung: von vorn zählen.
    if (now - this.wheelLast > 250 || Math.sign(delta) !== Math.sign(this.wheelSum)) this.wheelSum = 0;
    this.wheelLast = now;
    if (now < this.wheelLocked) return;
    this.wheelSum += delta;
    if (Math.abs(this.wheelSum) < WHEEL_STEP) return;
    this.handlers.zoom(this.wheelSum < 0 ? 1 : -1, this.point(e));
    this.wheelSum = 0;
    this.wheelLocked = now + WHEEL_PAUSE;
  }
}
