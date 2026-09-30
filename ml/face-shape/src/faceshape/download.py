"""Step `make download`: fetch the raw datasets into `<data-dir>/raw/`.

(a) Kaggle `niten19/face-shape-dataset` -> `raw/niten19/` (needs an API token: `KAGGLE_API_TOKEN` or
    `~/.kaggle/access_token` (new `KGAT_...` tokens), or the legacy `~/.kaggle/kaggle.json` /
    `KAGGLE_USERNAME`+`KAGGLE_KEY`; exits non-zero when missing).
    Each `kaggle_extra` dataset -> `raw/<dir>/` the same way.
(b) Each Roboflow project in the config -> `raw/roboflow/<slug>/`: via the `roboflow` package when
    `ROBOFLOW_API_KEY` is set, else a manual "Folder Structure" export already placed there (a zip
    is extracted), else print instructions and skip (plan Q5).
Sources that already hold images are skipped, so re-running is cheap.
"""
import os
import zipfile
from pathlib import Path
from typing import Any

from faceshape.common import build_parser, fail, is_image, parse


def _has_images(folder: Path) -> bool:
    return folder.is_dir() and any(is_image(p) for p in folder.rglob("*"))


def _kaggle_token_present() -> bool:
    if os.environ.get("KAGGLE_API_TOKEN"):
        return True
    if os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"):
        return True
    config_dir = Path(os.environ.get("KAGGLE_CONFIG_DIR", Path.home() / ".kaggle"))
    return (config_dir / "access_token").is_file() or (config_dir / "kaggle.json").is_file()


def download_kaggle(cfg: dict[str, Any], raw_dir: Path) -> None:
    dest = raw_dir / cfg["dir"]
    if _has_images(dest):
        print(f"[kaggle] {cfg['slug']}: already present in {dest}, skipping.")
        return
    if not _kaggle_token_present():
        fail(
            "Kaggle API token not found. Create one at https://www.kaggle.com/settings "
            "(API Tokens -> Generate New Token), save it to ~/.kaggle/access_token "
            "(`chmod 600`) or export KAGGLE_API_TOKEN, then re-run `make download`."
        )
    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    dest.mkdir(parents=True, exist_ok=True)
    print(f"[kaggle] downloading {cfg['slug']} -> {dest} ...")
    api.dataset_download_files(cfg["slug"], path=str(dest), unzip=True, quiet=False)


def _extract_zips(dest: Path) -> None:
    for archive in sorted(dest.glob("*.zip")):
        print(f"[roboflow] extracting manual export {archive} ...")
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(dest)


def download_roboflow(ds: dict[str, Any], raw_dir: Path) -> None:
    slug = ds["slug"]
    dest = raw_dir / "roboflow" / slug
    if not _has_images(dest) and dest.is_dir():
        _extract_zips(dest)
    if _has_images(dest):
        print(f"[roboflow] {slug}: already present in {dest}, skipping.")
        return

    api_key = os.environ.get("ROBOFLOW_API_KEY")
    manual_hint = (
        f"  Manual fallback: open {ds['source_url']}, export the dataset in 'Folder Structure' format "
        f"and put the zip (or its extracted folders) into {dest}/, then re-run `make download`."
    )
    if not api_key:
        print(f"[roboflow] {slug}: ROBOFLOW_API_KEY is not set and no manual export found - SKIPPED.")
        print("  Set it with `export ROBOFLOW_API_KEY=...` (free account: https://app.roboflow.com/settings/api).")
        print(manual_hint)
        return
    if ds.get("version") is None:
        print(f"[roboflow] {slug}: `version` is not set in config.yaml (TODO confirm) - SKIPPED.")
        print(f"  Open {ds['source_url']}, confirm workspace/project and set the version number.")
        print(manual_hint)
        return

    from roboflow import Roboflow

    dest.mkdir(parents=True, exist_ok=True)
    print(f"[roboflow] downloading {ds['workspace']}/{ds['project']} v{ds['version']} -> {dest} ...")
    project = Roboflow(api_key=api_key).workspace(ds["workspace"]).project(ds["project"])
    project.version(int(ds["version"])).download("folder", location=str(dest), overwrite=True)


def main() -> None:
    parser = build_parser("Download the Kaggle niten19 and Roboflow datasets into <data-dir>/raw/.")
    _, config, paths = parse(parser)
    sources = config["sources"]
    download_kaggle(sources["kaggle"], paths.raw)
    for ds in sources.get("kaggle_extra") or []:
        download_kaggle(ds, paths.raw)
    for ds in sources.get("roboflow") or []:
        download_roboflow(ds, paths.raw)


if __name__ == "__main__":
    main()
