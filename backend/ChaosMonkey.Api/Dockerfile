# syntax=docker/dockerfile:1.7
# Build context is the backend/ folder (see azure.yaml docker.context).

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore against just the project file first for better layer caching.
COPY ChaosMonkey.Api/ChaosMonkey.Api.csproj ChaosMonkey.Api/
RUN dotnet restore ChaosMonkey.Api/ChaosMonkey.Api.csproj

# Copy the rest of the API sources and publish.
COPY ChaosMonkey.Api/ ChaosMonkey.Api/
RUN dotnet publish ChaosMonkey.Api/ChaosMonkey.Api.csproj \
        -c Release \
        -o /app/publish \
        --no-restore \
        /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# Run as the non-root user provided by the base image.
USER $APP_UID

ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_EnableDiagnostics=0

EXPOSE 8080

COPY --from=build /app/publish .

ENTRYPOINT ["dotnet", "ChaosMonkey.Api.dll"]
