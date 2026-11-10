# Recommendation dataset pipeline (plan 09). Run from ml/recommendation/ inside the Python 3.11 venv.
# `make all` = the offline steps only: simulate -> dataset (which ends by writing the dataset card).
# `publish` / `export-real` need the running stack (docker compose in infra/), see README.md.
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

export PYTHONPATH := ../../recommendation-service:src
RUN = $(PYTHON) -m recsys
SIM_ARGS = $(if $(SIM_SEED),--seed $(SIM_SEED)) $(if $(USERS),--users $(USERS)) $(if $(DAYS),--days $(DAYS))

.PHONY: simulate publish export-real dataset card all

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
