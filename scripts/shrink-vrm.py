"""
Уменьшает текстуры внутри VRM (glTF-binary), не трогая остальное: скелет, blendshape-выражения,
spring bones и метаданные (лицензию) VRM. Нужно, чтобы базовые модели грузились на телефоне.

  python scripts/shrink-vrm.py <вход.vrm> <выход.vrm> [--max 1024]

Картинки пережимаются в PNG (с прозрачностью) или JPEG (без неё) с максимальной стороной --max.
Требуется Pillow.
"""
import argparse
import io
import json
import struct

from PIL import Image


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, _ = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2:
        raise SystemExit(f"{path}: не glTF 2.0 binary")
    off = 12
    doc, binary = None, b""
    while off < len(data):
        clen, ctype = struct.unpack_from("<I4s", data, off)
        chunk = data[off + 8 : off + 8 + clen]
        if ctype == b"JSON":
            doc = json.loads(chunk.decode("utf-8"))
        elif ctype == b"BIN\x00":
            binary = chunk
        off += 8 + clen
    return doc, binary


def pad4(b, fill=b"\x00"):
    return b + fill * ((4 - len(b) % 4) % 4)


def write_glb(path, doc, binary):
    js = pad4(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), b" ")
    binary = pad4(binary)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(struct.pack("<I4s", len(binary), b"BIN\x00") + binary)


def shrink_image(raw, mime, max_side):
    img = Image.open(io.BytesIO(raw))
    img.load()
    w, h = img.size
    scale = min(1.0, max_side / max(w, h))
    if scale < 1.0:
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
    if has_alpha:
        alpha = img.convert("RGBA").getchannel("A")
        has_alpha = alpha.getextrema()[0] < 255
    out = io.BytesIO()
    if has_alpha or mime == "image/png" and img.mode in ("RGBA", "LA", "P"):
        img.convert("RGBA" if has_alpha else "RGB").save(out, "PNG", optimize=True)
        new_mime = "image/png"
    else:
        img.convert("RGB").save(out, "JPEG", quality=88, optimize=True)
        new_mime = "image/jpeg"
    data = out.getvalue()
    # не делаем хуже исходника
    return (data, new_mime) if len(data) < len(raw) or scale < 1.0 else (raw, mime)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--max", type=int, default=1024)
    a = ap.parse_args()

    doc, binary = read_glb(a.src)
    views = doc["bufferViews"]
    image_views = {img["bufferView"]: i for i, img in enumerate(doc.get("images", [])) if "bufferView" in img}

    # собираем BIN заново: картинки пережимаем, остальные bufferView копируем как есть
    new_bin = bytearray()
    for vi, v in enumerate(views):
        start = v.get("byteOffset", 0)
        chunk = binary[start : start + v["byteLength"]]
        if vi in image_views:
            img = doc["images"][image_views[vi]]
            chunk, img["mimeType"] = shrink_image(chunk, img.get("mimeType", "image/png"), a.max)
        while len(new_bin) % 4:
            new_bin.append(0)
        v["byteOffset"] = len(new_bin)
        v["byteLength"] = len(chunk)
        new_bin += chunk
    doc["buffers"][0]["byteLength"] = len(new_bin)
    write_glb(a.dst, doc, bytes(new_bin))
    print(f"{a.src} -> {a.dst}: {len(binary) / 1e6:.1f} MB -> {len(new_bin) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
