.DEFAULT_GOAL := run

.PHONY: run build help

run:
	@test -f app/electron/build/main.js -a -f app/electron/build/index.html || $(MAKE) build
	npm exec -- electron ./app/electron/build --user-data-dir="$(CURDIR)/app/electron/userdata"

build:
	npm run build --workspace=app/electron

help:
	@printf '%-12s %s\n' 'make' 'Run the cached Electron app (build if missing)' 'make run' 'Run the cached Electron app (build if missing)' 'make build' 'Rebuild the Electron app' 'make help' 'Show this help'
