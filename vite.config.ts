import { defineConfig } from 'vite';

// import the defuss plugin - JSX for the UI components (resource bar, menu, ...)
import defuss from 'defuss-vite';

export default defineConfig({
  // add the defuss() plugin to make JSX transpilation work
  plugins: [defuss()],
});
