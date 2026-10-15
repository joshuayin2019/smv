export function isWebglSupported(): boolean {
  if (typeof window === "undefined" || !window.WebGLRenderingContext) return false;
  try {
    const canvas = document.createElement("canvas");
    // add { failIfMajorPerformanceCaveat: true } as a 2nd argument to also reject
    // software rendering (works, but slow)
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return !!gl && typeof gl.getParameter === "function";
  } catch {
    return false; // WebGL exists but is disabled
  }
}