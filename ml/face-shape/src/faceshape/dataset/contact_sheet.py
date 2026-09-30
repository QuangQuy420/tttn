"""Step `make review`: per-class HTML contact sheets for manual label review.

Writes `interim/review/<CLASS>.html` (thumbnail grid + image_id + source + original label), one
page per class, plus `index.html`. Follow `docs/labeling-checklist.md` while reviewing.

To fix labels, create `interim/review/relabels.csv`:

    image_id,new_label
    3f2a9c0d1b2e4f56,DIAMOND
    0a1b2c3d4e5f6789,DROP

`new_label` is one of the classes in config.yaml or `DROP`. `make manifest` applies it on the next
run (re-run the later steps afterwards).
"""
import csv
import html
import os
from pathlib import Path

from faceshape.common import build_parser, parse, require_file

_PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{title}</title>
<style>
body {{ font-family: sans-serif; margin: 16px; background: #fafafa; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }}
figure {{ margin: 0; background: #fff; border: 1px solid #ddd; padding: 6px; }}
img {{ width: 100%; height: 180px; object-fit: contain; background: #eee; }}
figcaption {{ font-size: 12px; word-break: break-all; }}
code {{ user-select: all; }}
</style></head><body>
<h1>{title}</h1>
<p>{summary} &mdash; see docs/labeling-checklist.md; record fixes in relabels.csv (image_id,new_label|DROP).</p>
{body}
</body></html>
"""


def _card(row: dict[str, str], review_dir: Path) -> str:
    src = os.path.relpath(Path(row["path"]).resolve(), review_dir.resolve())
    return (
        "<figure>"
        f'<a href="{html.escape(src)}" target="_blank"><img loading="lazy" src="{html.escape(src)}"></a>'
        f"<figcaption><code>{html.escape(row['image_id'])}</code><br>"
        f"{html.escape(row['source'])} &middot; {html.escape(row['original_label'])}</figcaption>"
        "</figure>"
    )


def main() -> None:
    parser = build_parser("Write per-class HTML contact sheets for manual label review.")
    _, config, paths = parse(parser)
    require_file(paths.sources_csv, "Run `make manifest` first.")
    with paths.sources_csv.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    paths.review.mkdir(parents=True, exist_ok=True)
    links = []
    for label in config["classes"]:
        class_rows = [r for r in rows if r["label"] == label]
        body = '<div class="grid">' + "".join(_card(r, paths.review) for r in class_rows) + "</div>"
        page = _PAGE.format(title=f"{label} ({len(class_rows)} images)", summary=f"Class {label}", body=body)
        (paths.review / f"{label}.html").write_text(page, encoding="utf-8")
        links.append(f'<li><a href="{label}.html">{label}</a> ({len(class_rows)})</li>')

    index = _PAGE.format(title="Face-shape label review", summary="One page per class", body="<ul>" + "".join(links) + "</ul>")
    (paths.review / "index.html").write_text(index, encoding="utf-8")
    print(f"Wrote contact sheets to {paths.review}/ (open index.html).")


if __name__ == "__main__":
    main()
