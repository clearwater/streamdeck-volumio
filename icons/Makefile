FILES := pause.png play.png volumeDown.png volumeUp.png
FOREGROUND := xc:purple 
BACKGROUND := xc:black
all: $(FILES)

clean:
	rm -f foreground.png background.png mask.png $(FILES)

background.png:
	convert -size 72x72 $(BACKGROUND)  background.png

foreground.png:
	convert -size 72x72 $(FOREGROUND) foreground.png


$(FILES): foreground.png background.png
	convert original/$@ -negate mask.png
	convert foreground.png background.png   mask.png -composite $@

install:
	cp $(FILES) ../Sources/au.com.clearwater.volumio.sdPlugin