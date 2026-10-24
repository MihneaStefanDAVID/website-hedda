"""Convert uploads browsers can't display (JPEG 2000, TIFF) to JPG.

The CMS accepts any file, but Chrome, Firefox and Edge cannot show .jp2 or
.tif images, so the site would show an empty frame. Run by the
convert-uploads GitHub Action after every push. Each such file in
src/assets/uploads is moved to originals/uploads (outside src/, so not
published but kept at full resolution) and turned into two JPGs with a
plain ASCII name:

- src/assets/uploads/<name>.jpg, shown on the page (PAGE_SIDE px), and
- src/assets/zoom/<name>.jpg, loaded when the photo is enlarged so it can
  be zoomed into (ZOOM_SIDE px). It is kept out of the uploads folder so
  the CMS media library doesn't list every photo twice.

Every project that referenced the original is pointed at the page JPG.
"""

import re
import unicodedata
from pathlib import Path

from PIL import Image

UPLOADS = Path("src/assets/uploads")
ZOOM = Path("src/assets/zoom")
PROJECTS = Path("src/projects")
ORIGINALS = Path("originals/uploads")
CONVERT = (".jp2", ".j2k", ".jpf", ".jpx", ".tif", ".tiff")
PAGE_SIDE = 3000  # px, long side
ZOOM_SIDE = 12000

Image.MAX_IMAGE_PIXELS = None  # architecture exports can be ~900 megapixels


def jpg_name(name: str) -> str:
    """'brücke-.jp2' -> 'bruecke-.jpg' (ASCII only, so URLs never depend on Unicode normalization)."""
    stem = unicodedata.normalize("NFC", Path(name).stem)
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("Ä", "Ae"), ("Ö", "Oe"), ("Ü", "Ue"), ("ß", "ss")):
        stem = stem.replace(a, b)
    stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-") + ".jpg"


def save_jpg(src: Path, dst: Path, long_side: int) -> None:
    im = Image.open(src)
    if src.suffix.lower() not in (".tif", ".tiff"):
        # JPEG 2000 can decode straight at 1/2, 1/4, ... resolution, which
        # keeps memory low for huge plans. Pick the smallest image that is
        # still at least long_side on its long side.
        reduce = 0
        while max(im.size) / 2 ** (reduce + 1) >= long_side:
            reduce += 1
        im.reduce = reduce
    im.load()
    if im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info:
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.getchannel("A"))
        im = bg
    else:
        im = im.convert("RGB")
    im.thumbnail((long_side, long_side), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "JPEG", quality=85, optimize=True, progressive=True)
    print(f"wrote {dst} {im.size[0]}x{im.size[1]}")


def main() -> None:
    for src in sorted(UPLOADS.iterdir()):
        if src.suffix.lower() in CONVERT:
            ORIGINALS.mkdir(parents=True, exist_ok=True)
            src.replace(ORIGINALS / src.name)

    # Fill in whatever is missing, so a failed run is completed by the next.
    if ORIGINALS.exists():
        for orig in sorted(ORIGINALS.iterdir()):
            if orig.suffix.lower() in CONVERT:
                name = jpg_name(orig.name)
                if not (UPLOADS / name).exists():
                    save_jpg(orig, UPLOADS / name, PAGE_SIDE)
                if not (ZOOM / name).exists():
                    save_jpg(orig, ZOOM / name, ZOOM_SIDE)

    # Point projects at the JPGs. Also catches a project saved later from a
    # stale editor tab that still names the original upload.
    ref = re.compile(r"[^\s\"'<>()]+\.(?:" + "|".join(e[1:] for e in CONVERT) + r")\b", re.IGNORECASE)

    def fix(m: re.Match) -> str:
        path = m.group(0)
        new = jpg_name(path.rsplit("/", 1)[-1])
        if not (UPLOADS / new).exists():
            return path
        return (path.rsplit("/", 1)[0] + "/" if "/" in path else "") + new

    for md in sorted(PROJECTS.glob("*.md")):
        text = md.read_text(encoding="utf-8")
        fixed = ref.sub(fix, text)
        if fixed != text:
            md.write_text(fixed, encoding="utf-8")
            print(f"updated {md.name}")


if __name__ == "__main__":
    main()
