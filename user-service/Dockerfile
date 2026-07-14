# Dockerfile — user-service
# ============================================================================
# Spring Boot (JDK 25, Maven) — layered app described in ./README.md
# (routes -> services -> repositories -> db, under src/main/java/com/tttn/userservice).
# ============================================================================
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x mvnw && ./mvnw -B dependency:go-offline
COPY src ./src
RUN ./mvnw -B package -DskipTests

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
