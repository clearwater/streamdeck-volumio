PLUGIN = au.com.clearwater.volumio.sdPlugin
TARGET = Release/au.com.clearwater.volumio.streamDeckPlugin

build:
	mkdir -p Release
	rm -rf $(TARGET)
	(cd Sources/$(PLUGIN) && yarn install)
	(cd Sources && zip -r - $(PLUGIN) $(PLUGIN)/*) > $(TARGET)

install:
	open $(TARGET)

test:
	DEBUG=* node Sources/au.com.clearwater.volumio.sdPlugin/main.js
