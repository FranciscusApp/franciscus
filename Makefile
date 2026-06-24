DATA_DIR ?= ../franciscus-data
DB_OUTPUT = app/static/franciscus.db

.PHONY: all db app dev install clean

all: db app

install: app/node_modules

app/node_modules: app/package.json
	cd app && npm install
	# The app loads the FTS5-enabled glue from fts5-sql-bundle, so the wasm
	# must come from there too — the stock sql.js wasm is a mismatched build.
	cp app/node_modules/fts5-sql-bundle/dist/sql-wasm.wasm app/static/

check:
	cd app && npm run check

db:
	cargo run --manifest-path server/Cargo.toml -- build --data-dir $(DATA_DIR) --output $(DB_OUTPUT)

app: install db
	cd app && npm run build

dev: install db
	cd app && npm run dev

clean:
	rm -f $(DB_OUTPUT)
	rm -rf app/build
	rm -rf server/target
