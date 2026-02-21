CURL = curl
WGET = wget
SAVEURL = $(WGET) -O
GIT = git

all: data build

clean:

updatenightly: build-index
	$(CURL) -s -S -L https://gist.githubusercontent.com/wakaba/34a71d3137a52abb562d/raw/gistfile1.txt | sh
	#$(GIT) add bin/modules generated
	perl local/bin/pmbp.pl --update
	$(GIT) add config
	$(CURL) -sSLf https://raw.githubusercontent.com/wakaba/ciconfig/master/ciconfig | RUN_GIT=1 REMOVE_UNUSED=1 perl
	#
	$(MAKE) updatebyhook

updatebyhook: data
#	$(GIT) add 

## ------ Setup ------

PERL = ./perl

deps: git-submodules pmbp-install

git-submodules:
	$(GIT) submodule update --init

local/bin/pmbp.pl:
	mkdir -p local/bin
	$(CURL) -s -S -L -f https://raw.githubusercontent.com/pawjy/perl-setupenv/master/bin/pmbp.pl > $@
pmbp-upgrade: local/bin/pmbp.pl
	perl local/bin/pmbp.pl --update-pmbp-pl
pmbp-update: git-submodules pmbp-upgrade
	perl local/bin/pmbp.pl --update
pmbp-install: pmbp-upgrade
	perl local/bin/pmbp.pl --install \
            --create-perl-command-shortcut perl

## ------ Build ------

build: build-index data

data: deps data-main

data-main: 

build-github-pages: deps build-gp-main build-gp-index build-gp-cleanup

build-gp-main:
	mkdir -p local
	# XXXX
	docker run -v `pwd`/local:/local --user `id --user` quay.io/suikawiki/swfonts cp -R /app/fonts/swcf /local/swcf
	mv local/swcf/hanmin local/swcf/*.* ./swcf/
build-gp-cleanup:
	rm -fr ./bin/modules ./modules ./local ./deps
	rm config/perl/libs.txt

build-for-docker: build-for-docker-from-old \
    local/swcf
#	-chmod ugo+r -R local/swcf

build-for-docker-from-old:
	mkdir -p local
	# XXXX
	docker run -v `pwd`/local:/local --user `id --user` quay.io/suikawiki/swfonts cp -R /app/fonts/swcf /local/swcf || mkdir -p local/swcf

local/swcf: always

build-index: deps 

build-gp-index: 

## ------ Tests ------

test: test-main test-deps

test-deps: deps

test-main:

always:

## License: Public Domain.
