// Declares CSS modules so `noUncheckedSideEffectImports` accepts the global
// stylesheet side-effect import (e.g. `import "./index.css"`). The bundler
// (electron-vite) handles the actual CSS; TypeScript only needs the module to exist.
declare module "*.css";
