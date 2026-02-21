CURL = curl
WGET = wget
SAVEURL = $(WGET) -O
GIT = git

all: data build

clean:

updatenightly: build-index
	$(CURL) -sSLf https://gist.githubusercontent.com/wakaba/34a71d3137a52abb562d/raw/gistfile1.txt | sh
	$(GIT) add bin/modules
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
	mkdir -p local current
	docker run -v `pwd`/local:/local --user `id --user` quay.io/suikawiki/swfonts:swcf cp -R /app/fonts/swir /local/swir
	mv local/swir current/swir
build-gp-cleanup:
	rm -fr ./bin/modules ./modules ./local ./deps
	rm config/perl/libs.txt

build-for-docker: build-for-docker-from-old \
    local/swir
	-chmod ugo+r -R local/swir

build-for-docker-from-old:
	mkdir -p local
	docker run -v `pwd`/local:/local --user `id --user` quay.io/suikawiki/swfonts:swcf cp -R /app/fonts/swir /local/swir || mkdir -p local/swir

local/swdata-swir-ids.txt:
	$(CURL) -sSLf https://raw.githubusercontent.com/suikawiki/extracted/refs/heads/master/data/extracted/swir-ids.txt > $@
local/swdata-swir-list.txt: local/swdata-swir-ids.txt 
	cat local/swdata-swir-ids.txt | \
	awk '{ q = int($$1 / 1000); r = $$1 % 1000; printf "local/data/ids/%d/%d.txt\n", q, r }' > $@
local/swir: local-swdata-repo bin/swir-list.pl local/swdata-swir-list.txt \
    always
	mkdir -p $@
	$(PERL) bin/swir-list.pl local/swdata-swir-list.txt > $@/list.json

local-swdata-repo:
	$(GIT) clone --depth 1 https://github.com/suikawiki/suikawiki-data local/data || \
	(cd local/data && $(GIT) fetch --depth 1 origin master && $(GIT) checkout origin/master)

build-index: deps 

build-gp-index: 

## ------ Tests ------

test: test-main test-deps

test-deps: deps

test-main:

always:

## License: Public Domain.
