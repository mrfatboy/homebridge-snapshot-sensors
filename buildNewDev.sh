#!/bin/bash

clear

cd ~/HomebridgeDev/homebridge-snapshot-sensors
git pull origin NewDev
npm run build
npm pack
sudo npm install --prefix /var/lib/homebridge ./homebridge-snapshot-sensors-1.0.0.tgz
sudo systemctl restart homebridge

