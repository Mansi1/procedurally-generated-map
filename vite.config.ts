import { defineConfig, type Plugin } from 'vite';
// defuss: JSX-Komponenten für die Oberfläche (Rohstoffleiste, Menü, ...).
import defuss from 'defuss-vite';

export default defineConfig({
  plugins: [defuss() as Plugin],
});
