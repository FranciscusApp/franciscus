DATA_DIR ?= ../franciscus-data
DB_OUTPUT = app/static/franciscus.db

# Corpus provenance stamped into the DB's `meta` table. Read from the data
# repo's git state; empty (and harmless) when DATA_DIR isn't a git checkout.
DATA_COMMIT := $(shell git -C $(DATA_DIR) rev-parse --short HEAD 2>/dev/null)
DATA_COMMIT_DATE := $(shell git -C $(DATA_DIR) show -s --format=%cs HEAD 2>/dev/null)
BUILD_TIME := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)

.PHONY: all db app dev install clean

all: db app

install: app/node_modules app/static/sql-wasm.wasm

app/node_modules: app/package.json
	cd app && npm install

app/static/sql-wasm.wasm: app/node_modules
	cp app/node_modules/fts5-sql-bundle/dist/sql-wasm.wasm app/static/

check:
	cd app && npm run check

# Writes three artifacts next to each other in app/static/: the sql.js
# database (franciscus.db), the hub-page manifest (db-manifest.json), and the
# hub sitemap (sitemap.xml). The manifest + sitemap are emitted from the same
# build as the DB, so they cannot drift from it.
db:
	FRANCISCUS_DATA_COMMIT="$(DATA_COMMIT)" \
	FRANCISCUS_DATA_COMMIT_DATE="$(DATA_COMMIT_DATE)" \
	FRANCISCUS_BUILD_TIME="$(BUILD_TIME)" \
	cargo run --manifest-path server/Cargo.toml -- build --data-dir $(DATA_DIR) --output $(DB_OUTPUT)

app: install db
	cd app && npm run build

dev: install db
	cd app && npm run dev

clean:
	rm -f $(DB_OUTPUT)
	rm -rf app/build
	rm -rf server/target
