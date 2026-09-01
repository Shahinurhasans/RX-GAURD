#!/usr/bin/env bash
ss -tlnp 2>&1 | grep -E "7050|7054|8054|9054"
echo "---docker-proxy---"
pgrep -a docker-proxy
