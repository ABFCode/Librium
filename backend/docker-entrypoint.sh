#!/bin/sh
export SPRING_DATASOURCE_PASSWORD=$(cat /run/secrets/db-password)
echo "Exported SPRING_DATASOURCE_PASSWORD from /run/secrets/db-password"
export JWT_SECRET=$(cat /run/secrets/jwt-secret)
echo "Exported JWT_SECRET from /run/secrets/jwsecret"

exec java -Dfile.encoding=UTF-8 \
  -Djava.security.egd=file:/dev/./urandom \
  -jar /app/app.jar
