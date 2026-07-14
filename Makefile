.DEFAULT_GOAL := run

.PHONY: run build help

run:
	@test -f dist/app/main.js -a -f dist/app/index.html || $(MAKE) build
	@mkdir -p dist/downloads
	@test -d dist/userdata -o ! -d app/electron/userdata || mv app/electron/userdata dist/userdata
	npm exec -- electron ./dist/app --user-data-dir="$(CURDIR)/dist/userdata" --portable-root="$(CURDIR)/dist"

build:
	npm run build --workspace=app/electron

help:
	@printf '%-12s %s\n' 'make' 'Run the cached Electron app (build if missing)' 'make run' 'Run the cached Electron app (build if missing)' 'make build' 'Rebuild the Electron app' 'make help' 'Show this help'
