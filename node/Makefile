SHELL:=/bin/bash

all: install README.md

.PHONY: help

docs:
	npx jsdoc index.js -d docs

install: node-install deno-install

node-install:
	npm install .
	npm install -g .

deno-install:
	deno install --global -f --name rw --config deno.json --allow-run --allow-read --allow-write --allow-sys --allow-env --allow-net cli.js

## Regenerate README.md
README.md: _README.md.tmpl
	@bfr=$$(cat "$<"); \
	help=$$(npx rw --help 2> /dev/null || true); \
	bfr=$$(echo "$${bfr/\{\{ HELP \}\}/$$help}"); \
	printf "$$bfr" > $@
	grep -F "Version:" "$@"
	@echo "README.md"

pack: install README.md
	npm pack

.PHONY: README.md
