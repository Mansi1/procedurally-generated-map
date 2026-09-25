import { defineConfig } from 'vite';

// import the defuss plugin - JSX for the UI components (resource bar, menu, ...)
import defuss from 'defuss-vite';

export default defineConfig({
  // add the defuss() plugin to make JSX transpilation work
  plugins: [defuss()],
  // Skelett-Clips aus Blender (src/models/*.glb) werden mit ?inline eingebettet.
  assetsInclude: ['**/*.glb'],
  build: {
    // Neben dem Spiel auch das L-System-Werkzeug (tools/lsystem/) und seine Galerie.
    rollupOptions: {
      input: {
        main: 'index.html',
        lsystem: 'tools/lsystem/index.html',
        lsystemGallery: 'tools/lsystem/gallery.html',
      },
    },
  },
});
