SHELL:=/bin/bash

all: install README.md

.PHONY: help

install:
	npm install .
	npm install -g .

## Regenerate README.md
README.md: _README.md.tmpl
	@bfr=$$(cat "$<"); \
	help=$$(npx rw --help 2> /dev/null || true); \
	bfr=$$(echo "$${bfr/\{\{ HELP \}\}/$$help}"); \
	printf "$$bfr" > $@
	grep -F "Version:" "$@"
	@echo "README.md"

publish: install README.md
	npm publish

.PHONY: README.md
