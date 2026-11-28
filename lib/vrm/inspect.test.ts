import { describe, expect, it } from "vitest";
import { inspectVrm, MAX_VRM_BYTES } from "./inspect";

function glb(json: unknown): ArrayBuffer {
  let js = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (js.length % 4)) % 4;
  const padded = new Uint8Array(js.length + pad).fill(0x20);
  padded.set(js);
  js = padded;
  const buf = new ArrayBuffer(20 + js.length);
  const v = new DataView(buf);
  [0x67, 0x6c, 0x54, 0x46].forEach((c, i) => v.setUint8(i, c));
  v.setUint32(4, 2, true);
  v.setUint32(8, buf.byteLength, true);
  v.setUint32(12, js.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf, 20).set(js);
  return buf;
}

describe("проверка VRM", () => {
  it("VRM 0.x и 1.0 с названием и автором", () => {
    expect(inspectVrm(glb({ extensions: { VRM: { meta: { title: "Аня", author: "me" } } } }))).toEqual({ ok: true, version: "0.x", title: "Аня", author: "me" });
    expect(inspectVrm(glb({ extensions: { VRMC_vrm: { meta: { name: "Anya", authors: ["me"] } } } }))).toEqual({ ok: true, version: "1.0", title: "Anya", author: "me" });
  });

  it("обычный glTF без VRM, не glTF и слишком большой файл отклоняются", () => {
    expect(inspectVrm(glb({ asset: { version: "2.0" } }))).toEqual({ ok: false, error: "not_vrm" });
    expect(inspectVrm(new TextEncoder().encode("hello, this is not a model at all").buffer)).toEqual({ ok: false, error: "not_glb" });
    expect(inspectVrm(new ArrayBuffer(MAX_VRM_BYTES + 1))).toEqual({ ok: false, error: "too_big" });
  });
});
