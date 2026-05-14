#!/bin/sh
# Força HOSTNAME=0.0.0.0 no processo Node independente do hostname do container Docker
export HOSTNAME=0.0.0.0
exec node apps/web/server.js
