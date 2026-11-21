# Simulador IoT de CampusPulse 360 (telemetria SIMULADA).
# Contexto de build: la raiz del repositorio.
#   docker build -f tools/simulator/Dockerfile -t campuspulse-simulator:dev .
#   docker run --rm -e API_URL=... -e GATEWAY_ID=... -e GATEWAY_KEY=<hex> campuspulse-simulator:dev live
# Node 24 ejecuta TypeScript directamente (sin compilar); el codigo no tiene dependencias de ejecucion.
FROM node:24-alpine
WORKDIR /app
RUN echo '{"type":"module"}' > package.json
COPY tools/simulator/src ./src
USER node
ENTRYPOINT ["node","src/cli.ts"]
CMD ["live"]
