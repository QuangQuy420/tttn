# Recommendation dataset pipeline (plan 09). Run from ml/recommendation/ inside the Python 3.11 venv.
# `make all` = the offline steps only: simulate -> dataset (which ends by writing the dataset card).
# `publish` / `export-real` need the running stack (docker compose in infra/), see README.md.
# Plan 10: `make train evaluate` (models in data/models/, results in reports/), then
#   make export RUN_NAME=v1-sim-YYYYMMDD   -> recommendation-service/models/preference/<run>-<algo>/
# Plan 12: `make experiment-hybrid` -> reports/hybrid/ (PreferenceScore vs + FaceFit, alpha/beta on val;
#   needs the exported model PREF_MODEL_DIR and the AI-1 test probabilities FACE_PROBS of ml/face-shape).
# Smoke run (outputs under data/, card not in reports/):
#   make all USERS=50 DAYS=10 SIM_SEED=1 CATALOG_SOURCE=seed SIM_DIR=data/smoke CARD_DIR=data/smoke/reports

# Uses the local venv when it exists, so `make` works without activating it.
PYTHON ?= $(if $(wildcard .venv/bin/python),.venv/bin/python,python)
CONFIG ?= configs/sim.yaml
SIM_DIR ?= data/sim
INTERACTIONS ?= $(SIM_DIR)/interactions.parquet
REAL_OUT ?= data/real/interactions.parquet
# auto = gateway API when the stack is up, otherwise infra/seed/products.json (offline only).
CATALOG_SOURCE ?= auto
CARD_DIR ?= reports
# Negative-sampling seed of build_dataset; SIM_SEED / USERS / DAYS empty = configs/sim.yaml.
SEED ?= 42
SIM_SEED ?=
USERS ?=
DAYS ?=
# export-real: e.g. EXCLUDE_SOURCE=simulator keeps only real events.
EXCLUDE_SOURCE ?=
# Plan 10 (train / evaluate / export). Real data: DATASET_DIR=data/real/dataset SOURCE=real.
DATASET_DIR ?= $(SIM_DIR)/dataset
MODELS_DIR ?= data/models
# Seed of every estimator / sampler in train + the bootstrap (separate from the dataset SEED).
TRAIN_SEED ?= 42
# v<N>-<data>-<YYYYMMDD>, e.g. v1-sim-20261110 (required by `make export`).
RUN_NAME ?=
SOURCE ?= simulated
# Plan 12 (experiment-hybrid): frozen PreferenceScore model + AI-1 (SVM) test probabilities.
PREF_MODEL_DIR ?= ../../recommendation-service/models/preference/v1-sim-20261110-xgbrank
FACE_PROBS ?= ../face-shape/reports/runs/v2-full-real-20261005/test_probabilities_svm.csv
HYBRID_DIR ?= reports/hybrid
# Service default reported next to the val-selected config (product decision, plan 12 Q5).
SERVICE_NORM ?= rank
SERVICE_ALPHA ?= 0.6

export PYTHONPATH := ../../recommendation-service:src
RUN = $(PYTHON) -m recsys
SIM_ARGS = $(if $(SIM_SEED),--seed $(SIM_SEED)) $(if $(USERS),--users $(USERS)) $(if $(DAYS),--days $(DAYS))

.PHONY: simulate publish export-real dataset card all train evaluate export experiment-hybrid

simulate:
	$(RUN).simulate --config $(CONFIG) --out-dir $(SIM_DIR) --catalog-source $(CATALOG_SOURCE) $(SIM_ARGS)

publish:
	$(RUN).publish --interactions $(INTERACTIONS)

export-real:
	$(RUN).export_real --out $(REAL_OUT) $(if $(EXCLUDE_SOURCE),--exclude-source $(EXCLUDE_SOURCE))

dataset:
	$(RUN).build_dataset --interactions $(INTERACTIONS) --catalog-source $(CATALOG_SOURCE) --card-dir $(CARD_DIR) --seed $(SEED)

card:
	$(RUN).dataset_card --interactions $(INTERACTIONS) --card-dir $(CARD_DIR)

all: simulate dataset

train:
	$(RUN).train --dataset-dir $(DATASET_DIR) --models-dir $(MODELS_DIR) --seed $(TRAIN_SEED)

evaluate:
	$(RUN).evaluate --dataset-dir $(DATASET_DIR) --models-dir $(MODELS_DIR) --seed $(TRAIN_SEED)

export:
	$(RUN).export --dataset-dir $(DATASET_DIR) --models-dir $(MODELS_DIR) --run-name "$(RUN_NAME)" --source $(SOURCE)

experiment-hybrid:
	$(RUN).experiment_hybrid --dataset-dir $(DATASET_DIR) --personas $(SIM_DIR)/personas.parquet --model-dir $(PREF_MODEL_DIR) --face-probabilities $(FACE_PROBS) --reports-dir $(HYBRID_DIR) --seed $(TRAIN_SEED) --service-norm $(SERVICE_NORM) --service-alpha $(SERVICE_ALPHA)
