// GalleryOverlay.tsx
// Die Seite der Galerie (/galerie): das Canvas, die Kopfzeile oben links und
// die Beschriftungen - je Stück sein Name, je Reihe ihr Titel. Einmal
// gerendert; wo die Beschriftungen stehen, setzt gallery.ts jedes Bild
// über die zurückgegebenen Elemente.

import { createRef, render, type Ref } from 'defuss';

function Head() {
  return (
    <div style="position:fixed;left:12px;top:10px;padding:6px 10px;border-radius:7px;background:rgba(0,0,0,0.45)">
      <b style="color:#6ee7a0">Soliva · Galerie</b> · alle Modelle und Animationen · Ziehen verschiebt, Mausrad zoomt ·
      ?zeige=Birke&amp;zoom=300 · <a href="/" style="color:#9ecbff">zum Spiel</a>
    </div>
  );
}

export interface GalleryElements {
  canvas: HTMLCanvasElement;
  /** Je Stück seine Beschriftung, in der Reihenfolge von `labels`. */
  labels: HTMLDivElement[];
  /** Je Reihe ihr Titel, in der Reihenfolge von `titles`. */
  titles: HTMLDivElement[];
}

/** Rendert die Galerie-Seite in `root` und gibt die Elemente zurück, die sich bewegen. */
export function mountGallery(root: HTMLElement, labels: string[], titles: string[]): GalleryElements {
  const canvas = createRef<HTMLCanvasElement>();
  const labelRefs: Ref<HTMLDivElement>[] = labels.map(() => createRef());
  const titleRefs: Ref<HTMLDivElement>[] = titles.map(() => createRef());
  render(
    <>
      <canvas ref={canvas} style="position:fixed;inset:0;width:100vw;height:100vh;cursor:grab" />
      <div style="position:fixed;inset:0;pointer-events:none">
        {labels.map((text, i) => (
          <div ref={labelRefs[i]}
            style="position:absolute;transform:translate(-50%,0);white-space:nowrap;font-size:11px;opacity:0.85">
            {text}
          </div>
        ))}
        {titles.map((text, i) => (
          <div ref={titleRefs[i]}
            style="position:absolute;transform:translate(-100%,-50%);white-space:nowrap;font-weight:600;color:#6ee7a0">
            {text}
          </div>
        ))}
      </div>
      <Head />
    </>,
    root,
  );
  return {
    canvas: canvas.current,
    labels: labelRefs.map((r) => r.current),
    titles: titleRefs.map((r) => r.current),
  };
}
