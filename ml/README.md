# ml/

Offline machine-learning work for the Smart Eyewear thesis. Not a service: nothing here runs in
Docker Compose.

- `face-shape/` - face-shape dataset pipeline (plan 06): download -> manifest + relabel -> dedup ->
  pseudo-identities -> MediaPipe landmarks -> geometric features -> identity-aware split -> dataset card.

The feature code is **not** in this folder: the scripts import
`face-processing-service/app/ml/face_features.py`, so training and the `/analyze` endpoint use the
same function (train/serve parity). The Makefile sets `PYTHONPATH=../../face-processing-service:src`.

## Quick start (first time)

All commands run from `ml/face-shape/`.

### 1. System libraries (once per machine, needs sudo)

```bash
sudo apt install -y libgles2 libegl1
```

MediaPipe's FaceLandmarker loads GLES/EGL (the service Dockerfile installs the same packages).
Without them `make landmarks` fails with
`OSError: libGLESv2.so.2: cannot open shared object file`.

### 2. Python 3.11 venv

The machine's default Python may be newer; mediapipe/insightface wheels target 3.11, so use a
dedicated venv in `ml/face-shape/.venv/` (git-ignored). `uv` downloads Python 3.11 if needed.

```bash
cd ml/face-shape
uv venv -p 3.11 .venv
source .venv/bin/activate
uv pip install -r requirements.txt
```

The Makefile uses `.venv/bin/python` automatically when it exists, so `make` works even without
activating the venv (override with `make all PYTHON=...`).

If `insightface` fails to build (needs a C++ compiler: `sudo apt install build-essential`), install
`face_recognition` instead and set `identity.backend: face_recognition` in `config.yaml`.

### 3. API keys

```bash
cp .env.example .env   # then fill in the two keys
```

The Makefile loads `.env` (git-ignored) automatically, so no `export` is needed.

- **Kaggle:** https://www.kaggle.com/settings -> API Tokens -> *Generate New Token* ->
  `KAGGLE_API_TOKEN=KGAT_...`. Saving the token to `~/.kaggle/access_token` (`chmod 600`) or the
  legacy `~/.kaggle/kaggle.json` also works.
- **Roboflow:** free account -> https://app.roboflow.com/settings/api -> `ROBOFLOW_API_KEY=...`.
  Without a key, export the dataset from its Universe page in *Folder Structure* format and put the
  zip (or extracted folders) in `data/raw/roboflow/<slug>/`; `make download` extracts it.

### 4. Download the data

```bash
make model      # MediaPipe model -> .cache/face_landmarker.task (~4 MB)
make download   # datasets -> data/raw/ (~720 MB: niten19 + the DIAMOND sources)
make manifest   # list the images actually used -> data/interim/sources.csv
```

`make manifest` prints the image count per class; expect 1,000 for each niten19 class and ~175
DIAMOND. Sources already in `data/raw/` are skipped, so re-running is cheap (`make all` and
`make sample` also run these three steps first).

### 5. Run the pipeline

```bash
make sample   # quick end-to-end check on ~100 images (outputs in data/sample/)
make all      # full run -> data/processed/{features.parquet,splits.csv} + reports/dataset_card.md
```

The first `make identity` also downloads the InsightFace `buffalo_l` weights (~300 MB, into
`~/.insightface/`). `make identity` and `make landmarks` run on CPU and take a while on ~5,000
images. Run `make sample` first: it shows a setup problem in minutes instead of after the long run.

After `make all`, read `reports/dataset_card.md` and check the per-class counts, the DIAMOND
shortfall and the rejection reasons (see Q3 in the plan if `yaw_exceeded` rejects > 15%).

## Data sources (`config.yaml` -> `sources`)

| source | classes used | images | license |
|---|---|---|---|
| Kaggle `niten19/face-shape-dataset` | HEART, OBLONG, OVAL, ROUND, SQUARE | 1,000 per class | unclear -> research use only |
| Kaggle `minhquangbui/face-shapes` (`kaggle_extra`) | DIAMOND only | 64 | not stated -> research use only |
| Kaggle `lucifierx/face-shape-classification` (`kaggle_extra`) | DIAMOND only | 12 | not stated -> research use only |
| Roboflow `face-detection-beautysense/face-shape-real-lagcm` v4 | DIAMOND only | 100 | CC BY 4.0 |

- A source's `keep_classes` limits which classes it adds; other class folders are ignored by
  `make manifest` (you may delete them from `data/raw/`, it changes nothing).
- Roboflow `plant-id/shape-face-oumca` is **excluded**: every version is stretched to 640x640,
  which distorts the length/width geometry the features measure.
- No public source has ~1,000 clean Diamond images, so DIAMOND stays the minority class
  (~170 before landmark filtering, below the plan's 200 minimum - the dataset card states it).
- When adding a Roboflow source, pick a version exported **without augmentations** (flip, rotate,
  ...): augmented copies inflate class counts. Dedup removes mirrored copies, not every augmentation.

## Steps

Every step is also a module: `python -m faceshape.<step> --config config.yaml --data-dir data`
(`--help` lists the options).

| make target | module | output (under `data/`) |
|---|---|---|
| `model` | - | `.cache/face_landmarker.task` (same `float16/1` model as the service Dockerfile) |
| `download` | `download` | `raw/niten19/`, `raw/<kaggle_extra dir>/`, `raw/roboflow/<slug>/` |
| `manifest` | `manifest` | `interim/sources.csv`, `interim/manifest_rejections.csv` |
| `review` | `contact_sheet` | `interim/review/<CLASS>.html` (see `face-shape/docs/labeling-checklist.md`) |
| `dedup` | `dedup` | `interim/dedup.csv` |
| `identity` | `identity` | `interim/identity.csv`, `interim/identity_calibration.json` |
| `landmarks` | `extract_landmarks` | `interim/landmarks.npz`, `interim/rejections.csv` |
| `features` | `build_features` | `processed/features.parquet` |
| `split` | `split` | `processed/splits.csv` |
| `card` | `dataset_card` | `reports/dataset_card.md`, `reports/class_balance.png` (committed) |

- `make all` runs every step in order; you can also re-run a single step (e.g. `make split`).
- `make sample` builds the full manifest, then runs the later steps on a seeded, class-stratified
  ~100-image subset in `data/sample/` (card in `data/sample/reports/`), so full outputs are not
  overwritten.
- `data/raw/` is only the download mirror: later steps read `interim/sources.csv`, not the raw
  folders.
- Manual label fixes: open `data/interim/review/<CLASS>.html`, write
  `data/interim/review/relabels.csv` (`image_id,new_label|DROP`) and re-run from `make manifest`.

Everything under `data/` and `.cache/` (images, landmarks, parquet, model) and `.env` is
git-ignored; only code, config, docs and `reports/` are committed. Thresholds, class map and seeds
are in `face-shape/config.yaml`.
