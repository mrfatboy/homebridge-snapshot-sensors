#!/bin/bash

clear

cd ~/HomebridgeDev/homebridge-snapshot-sensors || exit 1

git pull origin NewFeature || exit 1

npm run build || exit 1

PACKAGE_NAME=$(node -p "require('./package.json').name")
PACKAGE_VERSION=$(node -p "require('./package.json').version")
PACKAGE_FILE="${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz"

npm pack || exit 1

sudo npm install --prefix /var/lib/homebridge "./${PACKAGE_FILE}" || exit 1

sudo systemctl restart homebridge
