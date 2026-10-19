# Face-shape dataset pipeline (plan 06). Run from ml/face-shape/ inside the Python 3.11 venv.
# data/ layout (plan 2026-10-19): inputs/ (raw + curated images), datasets/<name>/ (interim/ + processed/),
# runs/<run>/models/ (models of one run) and logs/.
# `make all` runs every step on data/datasets/full-real/ (raw images from data/inputs/raw/); `make sample` runs
# them on a 100-image subset in data/datasets/sample/.
# Plan 07 (training): `make train evaluate ablation export RUN_NAME=v<N>-<data>-<YYYYMMDD>` writes the reports to
# reports/runs/<RUN_NAME>/ and the models to data/runs/<RUN_NAME>/models/, and exports the model as
# <RUN_NAME>-<algo> (see reports/README.md). Smoke run on the sample (scratch outputs in data/runs/sample/) with
# `make train evaluate ablation export DATA=data/datasets/sample RUN_NAME=v0-sample-<YYYYMMDD> REPORTS=data/runs/sample/reports MODELS=data/runs/sample/models EXPORT_DIR=data/runs/sample/export CV_FOLDS=2`.
# `make card` writes the dataset card to CARD_DIR (default reports/dataset; `make sample` uses data/runs/sample/reports).
# Plan 2026-10-18 (curated dataset): `make curated` builds the datasets data/datasets/{curated-real,curated-real-synth,
# full-real-synth}/, trains runs v3 (curated real), v4 (+ synthetic) and v5 (all old-train real + synthetic) into
# data/runs/<run>/models/ + reports/runs/<run>/ and writes reports/comparisons/20261019-curated-vs-current/compare.md;
# data/datasets/full-real/ and the v1/v2 reports stay untouched.

# Uses the local venv when it exists, so `make` works without activating it.
PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python)
CONFIG ?= config.yaml
DATA ?= data/datasets/full-real
RAW_DIR := data/inputs/raw
# Run name v<N>-<data>-<YYYYMMDD> (e.g. v6-full-real-20261101): train/evaluate/ablation/export need it
# (or an explicit REPORTS=, plus MODELS= for train/calibrate/evaluate/export); the model is exported as <RUN_NAME>-<algo>.
RUN_NAME ?=
REPORTS ?= $(if $(RUN_NAME),reports/runs/$(RUN_NAME))
MODELS ?= $(if $(RUN_NAME),data/runs/$(RUN_NAME)/models)
CARD_DIR ?= reports/dataset
SAMPLE_DATA := data/datasets/sample
# Scratch folder of the sample runs (card, reports, models, export) - never a real run.
SAMPLE_RUN := data/runs/sample
# Empty = use config.yaml (training.export_dir / training.cv_folds).
EXPORT_DIR ?=
CV_FOLDS ?=

# Same model as face-processing-service/Dockerfile (train/serve parity) - keep both in sync.
MODEL_URL := https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
MODEL := .cache/face_landmarker.task

export PYTHONPATH := ../../face-processing-service:src

# Local secrets (ROBOFLOW_API_KEY, KAGGLE_API_TOKEN) from the gitignored .env - see .env.example.
-include .env
export ROBOFLOW_API_KEY KAGGLE_API_TOKEN
RUN = $(PYTHON) -m faceshape
TRAIN_ARGS = --config $(CONFIG) --data-dir $(DATA) --out-dir $(REPORTS)
CV_ARG = $(if $(CV_FOLDS),--cv-folds $(CV_FOLDS))
# Expanded at the start of a recipe, so the target fails before running anything (never at parse time:
# `make all` / `make sample` need no run name).
NEED_REPORTS = $(if $(REPORTS),,$(error Set RUN_NAME=v<N>-<data>-<YYYYMMDD> (reports go to reports/runs/<RUN_NAME>/) or REPORTS=<dir>))
NEED_RUN_NAME = $(if $(RUN_NAME),,$(error Set RUN_NAME=v<N>-<data>-<YYYYMMDD> - the model is exported as <RUN_NAME>-<algo>))
NEED_MODELS = $(if $(MODELS),,$(error Set RUN_NAME=v<N>-<data>-<YYYYMMDD> (models go to data/runs/<RUN_NAME>/models/) or MODELS=<dir>))

.PHONY: model download manifest review dedup identity landmarks features split card all sample \
	train calibrate evaluate ablation export curated curated-synth curated-data curated-train curated-compare

model:
	@mkdir -p .cache
	@if [ -f $(MODEL) ]; then echo "$(MODEL) already present."; \
	else curl -fsSL -o $(MODEL) $(MODEL_URL) && echo "Downloaded $(MODEL)."; fi

download:
	$(RUN).dataset.download --config $(CONFIG) --raw-dir $(RAW_DIR)

manifest:
	$(RUN).dataset.manifest --config $(CONFIG) --data-dir $(DATA) --raw-dir $(RAW_DIR)

review:
	$(RUN).dataset.contact_sheet --config $(CONFIG) --data-dir $(DATA)

dedup:
	$(RUN).dataset.dedup --config $(CONFIG) --data-dir $(DATA)

identity:
	$(RUN).dataset.identity --config $(CONFIG) --data-dir $(DATA)

landmarks: model
	$(RUN).features.extract_landmarks --config $(CONFIG) --data-dir $(DATA)

features:
	$(RUN).features.build_features --config $(CONFIG) --data-dir $(DATA)

split:
	$(RUN).dataset.split --config $(CONFIG) --data-dir $(DATA)

card:
	$(RUN).dataset.dataset_card --config $(CONFIG) --data-dir $(DATA) --out-dir $(CARD_DIR)

all: model download manifest review dedup identity landmarks features split card

# Full manifest first (needs the raw data), then a seeded stratified subset and every later step
# on data/datasets/sample/ - the card goes to data/runs/sample/reports/ so reports/dataset/ is not overwritten.
sample: model download manifest
	$(RUN).dataset.sample --config $(CONFIG) --source-dir $(DATA) --data-dir $(SAMPLE_DATA)
	$(MAKE) review dedup identity landmarks features split card DATA=$(SAMPLE_DATA) CARD_DIR=$(SAMPLE_RUN)/reports

# Plan 07: tune (grouped CV on train+val) + calibrate (fit on train, calibrate on val).
train:
	$(NEED_REPORTS)$(NEED_MODELS)$(RUN).training.tune $(TRAIN_ARGS) $(CV_ARG)
	$(RUN).training.calibrate $(TRAIN_ARGS) --models-dir $(MODELS) $(CV_ARG)

# Calibrate only (tuning.json kept): re-run after a calibration change without re-tuning.
calibrate:
	$(NEED_REPORTS)$(NEED_MODELS)$(RUN).training.calibrate $(TRAIN_ARGS) --models-dir $(MODELS) $(CV_ARG)

# The only step that reads the test split: one pass per final method.
evaluate:
	$(NEED_REPORTS)$(NEED_MODELS)$(RUN).evaluation.evaluate $(TRAIN_ARGS) --models-dir $(MODELS)

ablation:
	$(NEED_REPORTS)$(RUN).evaluation.ablation $(TRAIN_ARGS) $(CV_ARG)

export:
	$(NEED_REPORTS)$(NEED_RUN_NAME)$(NEED_MODELS)$(RUN).training.export $(TRAIN_ARGS) --models-dir $(MODELS) --run-name $(RUN_NAME) $(if $(EXPORT_DIR),--export-dir $(EXPORT_DIR))

# Plan 2026-10-18: curated dataset (data/inputs/curated) -> runs v3 (curated real), v4 (curated real + synthetic)
# and v5 (every old-train real image + synthetic). Synthetic features live in data/datasets/synth; each run trains
# on its own dataset (D3/D4/D5) and keeps its models in data/runs/<run>/models.
# Synthetic images skip `dedup` (synth-sources writes an all-kept dedup.csv). One step per recipe
# line, so the sub-makes stay sequential under `-j`.
CURATED_DIR := data/inputs/curated
SYNTH_DATA := data/datasets/synth
D3 := data/datasets/curated-real
D4 := data/datasets/curated-real-synth
D5 := data/datasets/full-real-synth
COMPARE_REPORTS := reports/comparisons/20261019-curated-vs-current
V3 := v3-curated-real-20261018
V4 := v4-curated-real-synth-20261018
V5 := v5-full-real-synth-20261019
CURATED = $(RUN).dataset.curated --config $(CONFIG)
CURATED_BUILD = build --base-dir $(DATA) --synth-dir $(SYNTH_DATA) --curated-dir $(CURATED_DIR)

curated-synth:
	$(CURATED) --data-dir $(SYNTH_DATA) synth-sources --curated-dir $(CURATED_DIR)
	$(MAKE) identity DATA=$(SYNTH_DATA)
	$(MAKE) landmarks DATA=$(SYNTH_DATA)
	$(MAKE) features DATA=$(SYNTH_DATA)

curated-data:
	$(CURATED) --data-dir $(D3) $(CURATED_BUILD)
	$(CURATED) --data-dir $(D4) $(CURATED_BUILD) --with-synthetic
	$(CURATED) --data-dir $(D5) $(CURATED_BUILD) --all-real-train --with-synthetic

curated-train:
	$(MAKE) train DATA=$(D3) RUN_NAME=$(V3)
	$(MAKE) evaluate DATA=$(D3) RUN_NAME=$(V3)
	$(MAKE) ablation DATA=$(D3) RUN_NAME=$(V3)
	$(MAKE) train DATA=$(D4) RUN_NAME=$(V4)
	$(MAKE) evaluate DATA=$(D4) RUN_NAME=$(V4)
	$(MAKE) ablation DATA=$(D4) RUN_NAME=$(V4)
	$(MAKE) train DATA=$(D5) RUN_NAME=$(V5)
	$(MAKE) evaluate DATA=$(D5) RUN_NAME=$(V5)
	$(MAKE) ablation DATA=$(D5) RUN_NAME=$(V5)

# Read-only on the saved test metrics: deployed v2 vs v3 vs v4 vs v5.
curated-compare:
	$(RUN).evaluation.compare --config $(CONFIG) --out-dir $(COMPARE_REPORTS)

curated:
	$(MAKE) curated-synth
	$(MAKE) curated-data
	$(MAKE) curated-train
	$(MAKE) curated-compare
