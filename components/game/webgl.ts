/** Есть ли WebGL — иначе показываем 2D-портрет. Отдельно от вьюера, чтобы не тянуть three в бандл. */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}
