/**
 * Проверка файла VRM (фаза 4b) без three: заголовок glTF-binary и JSON-чанк с расширением VRM.
 * Работает и в браузере (до загрузки), и на сервере (после).
 */
export const MAX_VRM_BYTES = 30 * 1024 * 1024;

export type VrmCheck =
  | { ok: true; version: "0.x" | "1.0"; title: string | null; author: string | null }
  | { ok: false; error: "too_big" | "not_glb" | "not_vrm" };

export function inspectVrm(buf: ArrayBuffer): VrmCheck {
  if (buf.byteLength > MAX_VRM_BYTES) return { ok: false, error: "too_big" };
  if (buf.byteLength < 20) return { ok: false, error: "not_glb" };
  const v = new DataView(buf);
  const magic = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  if (magic !== "glTF" || v.getUint32(4, true) !== 2) return { ok: false, error: "not_glb" };
  const jsonLen = v.getUint32(12, true);
  const jsonType = v.getUint32(16, true);
  if (jsonType !== 0x4e4f534a || 20 + jsonLen > buf.byteLength) return { ok: false, error: "not_glb" };
  let doc: { extensions?: Record<string, { meta?: Record<string, unknown> }> };
  try {
    doc = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  } catch {
    return { ok: false, error: "not_glb" };
  }
  const ext = doc.extensions ?? {};
  const vrm0 = ext.VRM;
  const vrm1 = ext.VRMC_vrm;
  if (!vrm0 && !vrm1) return { ok: false, error: "not_vrm" };
  const meta = (vrm1 ?? vrm0)?.meta ?? {};
  const str = (x: unknown) => (typeof x === "string" ? x.slice(0, 80) : null);
  const author = Array.isArray(meta.authors) ? str(meta.authors[0]) : str(meta.author);
  return { ok: true, version: vrm1 ? "1.0" : "0.x", title: str(meta.title ?? meta.name), author };
}
