# Stage 1: Build with Maven
FROM maven:3.8.4-openjdk-17 AS maven_build
COPY pom.xml /build/
COPY mvnw /build/
COPY .mvn /build/.mvn
COPY src /build/src/
WORKDIR /build/
RUN mvn clean install -Pprod -Dmaven.test.skip=true \
  -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=WARN \
  -B --no-transfer-progress -e && \
  mvn package -Pprod -Dmaven.test.skip=true \
  -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=WARN \
  -B --no-transfer-progress -e

# Stage 2: Create the runtime image
FROM openjdk:17-oracle
WORKDIR /app

# Copy the built jar from the maven build stage.
COPY --from=maven_build /build/target/backend-0.0.1-SNAPSHOT.jar /app/app.jar

# Copy the entrypoint script into the image.
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

# Ensure the entrypoint script is executable.
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 8080

# Use the entrypoint script instead of a direct CMD.
ENTRYPOINT ["/app/docker-entrypoint.sh"]
