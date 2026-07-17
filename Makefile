DATA_DIR ?= ../franciscus-data
DB_OUTPUT = app/static/franciscus.db

# Corpus provenance stamped into the DB's `meta` table. Read from the data
# repo's git state; empty (and harmless) when DATA_DIR isn't a git checkout.
DATA_COMMIT := $(shell git -C $(DATA_DIR) rev-parse --short HEAD 2>/dev/null)
DATA_COMMIT_DATE := $(shell git -C $(DATA_DIR) show -s --format=%cs HEAD 2>/dev/null)
BUILD_TIME := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)

.PHONY: all db app dev dev-db run check install clean

all: app

install: app/node_modules app/static/sql-wasm.wasm

app/node_modules: app/package.json
	cd app && npm install

app/static/sql-wasm.wasm: app/node_modules
	cp app/node_modules/fts5-sql-bundle/dist/sql-wasm.wasm app/static/

check:
	cd app && npm run check

# The DB build. Writes three artifacts next to each other in app/static/: the
# sql.js database (franciscus.db), the hub-page manifest (db-manifest.json),
# and the hub sitemap (sitemap.xml). Emitted from the same build so they cannot
# drift from each other.
define build_db
	FRANCISCUS_DATA_COMMIT="$(DATA_COMMIT)" \
	FRANCISCUS_DATA_COMMIT_DATE="$(DATA_COMMIT_DATE)" \
	FRANCISCUS_BUILD_TIME="$(BUILD_TIME)" \
	cargo run --manifest-path server/Cargo.toml -- build --data-dir $(DATA_DIR) --output $(DB_OUTPUT)
endef

# File rule: build the DB only when it is missing. Used as a prerequisite so a
# fresh checkout works, without forcing a slow re-ingest on every `make dev`.
# `install` is order-only (|) so its phony-ness doesn't mark the DB stale.
$(DB_OUTPUT): | install
	$(build_db)

# Explicit rebuild — run this when the corpus in $(DATA_DIR) changes.
db:
	$(build_db)

app: install db
	cd app && npm run build

# Fast iteration: reuses an existing DB (builds one only on first run). Run
# `make db` yourself when the data changes, or use `make dev-db` for both.
dev run: install $(DB_OUTPUT)
	cd app && npm run dev

# Convenience: force a DB rebuild, then start the dev server.
dev-db: db
	cd app && npm run dev

clean:
	rm -f $(DB_OUTPUT)
	rm -rf app/build
	rm -rf server/target
