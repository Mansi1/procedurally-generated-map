// entry.ts
// Einstieg: /galerie zeigt alle Modelle und Animationen (gallery.ts), jede
// andere Adresse das Spiel (main.ts, dort /<seed>/<x>-<y>).
import './style.css';

if (window.location.pathname.replace(/\/+$/, '') === '/galerie') {
  void import('./gallery');
} else {
  void import('./main');
}
