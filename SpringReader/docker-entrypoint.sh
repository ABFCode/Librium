#!/bin/sh
export SPRING_DATASOURCE_PASSWORD=$(cat /run/secrets/db-password)
echo "Exported SPRING_DATASOURCE_PASSWORD from /run/secrets/db-password"

exec java -Dfile.encoding=UTF-8 \
  -Djava.security.egd=file:/dev/./urandom \
  -jar /app/app.jar
