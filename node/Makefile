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
	deno install --global -f --name rw --config deno.json --allow-run --allow-read --allow-write --allow-sys --allow-env --allow-net src/cli.js

tests: deno-tests node-tests

deno-tests:
	deno task test

node-tests:
	node --test 'tests/node/*.js'

escape-tests: deno-escape-tests node-escape-tests

deno-escape-tests:
	deno task deno-escape-tests

deno-examples-tests:
	deno task deno-examples-tests

node-escape-tests:
	node --test tests/node/escapes_test.js

node-examples-tests:
	node --test tests/node/examples_test.js

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
