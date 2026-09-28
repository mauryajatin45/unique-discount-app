#!/bin/bash
cd /var/www/unique-discount-store2

# Forcefully replace myapp with myapp_2 in the .env file
sed -i 's/myapp/myapp_2/g' .env

# Rebuild and restart to ensure it connects to the right database
docker compose up -d --force-recreate
