.DEFAULT_GOAL := run

.PHONY: run help

run:
	npm run build --workspace=app/electron
	npm exec -- electron ./app/electron/build

help:
	@printf '%-12s %s\n' 'make' 'Build and run the Electron app' 'make run' 'Build and run the Electron app' 'make help' 'Show this help'
