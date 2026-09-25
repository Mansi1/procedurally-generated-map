/** Ein Modell aus src/models/<name>.glb als OBJ- und MTL-Text (vite.config.ts, tools/models/glb.mjs). */
declare module '*.glb?model' {
  const model: { obj: string; mtl: string };
  export default model;
}
