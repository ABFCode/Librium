FROM maven:3.8.4-openjdk-17 AS maven_build
COPY pom.xml /build/
COPY mvnw /build/
COPY .mvn /build/.mvn
COPY src /build/src/
WORKDIR /build/
RUN mvn clean install -Pprod -Dmaven.test.skip=true -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=WARN -B --no-transfer-progress -e && mvn package -Pprod -Dmaven.test.skip=true -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=WARN -B --no-transfer-progress -e



FROM openjdk:17-oracle


WORKDIR /app


COPY --from=maven_build /build/target/SpringReader-0.0.1-SNAPSHOT.jar /app/app.jar


EXPOSE 8080


ENTRYPOINT ["java", "-Dfile.encoding=UTF-8", "-Djava.security.egd=file:/dev/./urandom", "-jar", "/app/app.jar"]