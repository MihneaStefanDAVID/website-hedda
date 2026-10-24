"""Convert uploads browsers can't display (JPEG 2000, TIFF) to JPG.

The CMS accepts any file, but Chrome, Firefox and Edge cannot show .jp2 or
.tif images, so the site would show an empty frame. Run by the
convert-uploads GitHub Action after every push: each such file in
src/assets/uploads becomes a JPG with a plain ASCII name, the original is
deleted, and every project that referenced it is pointed at the JPG.
"""

import re
import unicodedata
from pathlib import Path

from PIL import Image

UPLOADS = Path("src/assets/uploads")
PROJECTS = Path("src/projects")
CONVERT = (".jp2", ".j2k", ".jpf", ".jpx", ".tif", ".tiff")
LONG_SIDE = 4500  # px; plenty for the enlarged lightbox view

Image.MAX_IMAGE_PIXELS = None  # architecture exports can be ~900 megapixels


def jpg_name(name: str) -> str:
    """'brücke-.jp2' -> 'bruecke-.jpg' (ASCII only, so URLs never depend on Unicode normalization)."""
    stem = unicodedata.normalize("NFC", Path(name).stem)
    stem = stem.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("Ä", "Ae").replace("Ö", "Oe").replace("Ü", "Ue").replace("ß", "ss")
    stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-") + ".jpg"


def convert(src: Path, dst: Path) -> None:
    im = Image.open(src)
    if src.suffix.lower() in (".tif", ".tiff"):
        im.load()
    else:
        # JPEG 2000 can decode straight at 1/2, 1/4, ... resolution, which
        # keeps memory low for huge plans. Pick the smallest image that is
        # still at least LONG_SIDE on its long side.
        reduce = 0
        while max(im.size) / 2 ** (reduce + 1) >= LONG_SIDE:
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
    im.thumbnail((LONG_SIDE, LONG_SIDE), Image.LANCZOS)
    im.save(dst, "JPEG", quality=88, optimize=True, progressive=True)


def main() -> None:
    for src in sorted(UPLOADS.iterdir()):
        if src.suffix.lower() in CONVERT:
            dst = UPLOADS / jpg_name(src.name)
            if not dst.exists():
                convert(src, dst)
                print(f"converted {src.name} -> {dst.name}")
            src.unlink()

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
