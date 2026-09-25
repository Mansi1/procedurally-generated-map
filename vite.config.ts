import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// import the defuss plugin - JSX for the UI components (resource bar, menu, ...)
import defuss from 'defuss-vite';
import { glbToObj } from './tools/models/glb.mjs';

/** `import house from '../models/house.glb?model'` - das Modell als { obj, mtl }-Text (tools/models/glb.mjs). */
function glbModels(): Plugin {
  const suffix = '.glb?model';
  return {
    name: 'glb-model',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith(suffix)) return null;
      const file = id.slice(0, -'?model'.length);
      this.addWatchFile(file);
      return `export default ${JSON.stringify(glbToObj(readFileSync(file)))};`;
    },
  };
}

export default defineConfig({
  // add the defuss() plugin to make JSX transpilation work
  plugins: [glbModels(), defuss()],
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
