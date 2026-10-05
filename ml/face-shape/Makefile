# Face-shape dataset pipeline (plan 06). Run from ml/face-shape/ inside the Python 3.11 venv.
# `make all` runs every step on data/; `make sample` runs them on a 100-image subset in data/sample/.
# Plan 07 (training): `make train evaluate ablation export`; smoke run on the sample with
# `make train evaluate ablation export DATA=data/sample REPORTS=data/sample/reports EXPORT_DIR=data/sample/export CV_FOLDS=2`.

# Uses the local venv when it exists, so `make` works without activating it.
PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python)
CONFIG ?= config.yaml
DATA ?= data
REPORTS ?= reports
SAMPLE_DATA := data/sample
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

.PHONY: model download manifest review dedup identity landmarks features split card all sample \
	train calibrate evaluate ablation export

model:
	@mkdir -p .cache
	@if [ -f $(MODEL) ]; then echo "$(MODEL) already present."; \
	else curl -fsSL -o $(MODEL) $(MODEL_URL) && echo "Downloaded $(MODEL)."; fi

download:
	$(RUN).dataset.download --config $(CONFIG) --data-dir $(DATA)

manifest:
	$(RUN).dataset.manifest --config $(CONFIG) --data-dir $(DATA)

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
	$(RUN).dataset.dataset_card --config $(CONFIG) --data-dir $(DATA) --out-dir $(REPORTS)

all: model download manifest review dedup identity landmarks features split card

# Full manifest first (needs the raw data), then a seeded stratified subset and every later step
# on data/sample/ - the card goes to data/sample/reports/ so reports/ is not overwritten.
sample: model download manifest
	$(RUN).dataset.sample --config $(CONFIG) --source-dir data --data-dir $(SAMPLE_DATA)
	$(MAKE) review dedup identity landmarks features split card DATA=$(SAMPLE_DATA) REPORTS=$(SAMPLE_DATA)/reports

# Plan 07: tune (grouped CV on train+val) + calibrate (fit on train, calibrate on val).
train:
	$(RUN).training.tune $(TRAIN_ARGS) $(CV_ARG)
	$(RUN).training.calibrate $(TRAIN_ARGS) $(CV_ARG)

# Calibrate only (tuning.json kept): re-run after a calibration change without re-tuning.
calibrate:
	$(RUN).training.calibrate $(TRAIN_ARGS) $(CV_ARG)

# The only step that reads the test split: one pass per final method.
evaluate:
	$(RUN).evaluation.evaluate $(TRAIN_ARGS)

ablation:
	$(RUN).evaluation.ablation $(TRAIN_ARGS) $(CV_ARG)

export:
	$(RUN).training.export $(TRAIN_ARGS) $(if $(EXPORT_DIR),--export-dir $(EXPORT_DIR))
