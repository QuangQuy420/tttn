# Face-shape dataset pipeline (plan 06). Run from ml/face-shape/ inside the Python 3.11 venv.
# `make all` runs every step on data/; `make sample` runs them on a 100-image subset in data/sample/.

# Uses the local venv when it exists, so `make` works without activating it.
PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python)
CONFIG ?= config.yaml
DATA ?= data
REPORTS ?= reports
SAMPLE_DATA := data/sample

# Same model as face-processing-service/Dockerfile (train/serve parity) - keep both in sync.
MODEL_URL := https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
MODEL := .cache/face_landmarker.task

export PYTHONPATH := ../../face-processing-service:src

# Local secrets (ROBOFLOW_API_KEY, KAGGLE_API_TOKEN) from the gitignored .env - see .env.example.
-include .env
export ROBOFLOW_API_KEY KAGGLE_API_TOKEN
RUN = $(PYTHON) -m faceshape

.PHONY: model download manifest review dedup identity landmarks features split card all sample

model:
	@mkdir -p .cache
	@if [ -f $(MODEL) ]; then echo "$(MODEL) already present."; \
	else curl -fsSL -o $(MODEL) $(MODEL_URL) && echo "Downloaded $(MODEL)."; fi

download:
	$(RUN).download --config $(CONFIG) --data-dir $(DATA)

manifest:
	$(RUN).manifest --config $(CONFIG) --data-dir $(DATA)

review:
	$(RUN).contact_sheet --config $(CONFIG) --data-dir $(DATA)

dedup:
	$(RUN).dedup --config $(CONFIG) --data-dir $(DATA)

identity:
	$(RUN).identity --config $(CONFIG) --data-dir $(DATA)

landmarks: model
	$(RUN).extract_landmarks --config $(CONFIG) --data-dir $(DATA)

features:
	$(RUN).build_features --config $(CONFIG) --data-dir $(DATA)

split:
	$(RUN).split --config $(CONFIG) --data-dir $(DATA)

card:
	$(RUN).dataset_card --config $(CONFIG) --data-dir $(DATA) --out-dir $(REPORTS)

all: model download manifest review dedup identity landmarks features split card

# Full manifest first (needs the raw data), then a seeded stratified subset and every later step
# on data/sample/ - the card goes to data/sample/reports/ so reports/ is not overwritten.
sample: model download manifest
	$(RUN).sample --config $(CONFIG) --source-dir data --data-dir $(SAMPLE_DATA)
	$(MAKE) review dedup identity landmarks features split card DATA=$(SAMPLE_DATA) REPORTS=$(SAMPLE_DATA)/reports
