FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS response-validator
WORKDIR /validator
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
FROM twentycrm/twenty:v2.32.0@sha256:cb80b05bc2619a88a3a83293f45f2be495a55ac77a90946fa1f7d85f0b7fde24
USER root
RUN apk add --no-cache poppler-utils font-dejavu && command -v pdfinfo && command -v pdftotext && command -v pdftoppm
USER 1000
COPY --from=response-validator --chown=1000:1000 /validator/node_modules /opt/workflow-lazy-tools/node_modules
COPY --chown=1000:1000 patch.cjs test.cjs alias-test.cjs schema-validation.cjs workflow-continuation.cjs workflow-continuation.test.cjs /opt/workflow-lazy-tools/
RUN node /opt/workflow-lazy-tools/workflow-continuation.test.cjs && node /opt/workflow-lazy-tools/test.cjs && node /opt/workflow-lazy-tools/alias-test.cjs && node /opt/workflow-lazy-tools/patch.cjs
