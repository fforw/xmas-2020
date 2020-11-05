#!/bin/bash
yarn run build

name=$1;
if test -z "$name"; then
  name=$(basename $(realpath $(dirname $0)));
fi

target=static/demo/$name

echo "Synch to http://fforw.de/$target"

rsync -rvIz --rsh=ssh --delete --exclude=.git --exclude=*.blend ./docs/ newweb:/var/www/$target
