FROM twentycrm/twenty:v2.32.0@sha256:cb80b05bc2619a88a3a83293f45f2be495a55ac77a90946fa1f7d85f0b7fde24
COPY --chown=1000:1000 patch.cjs test.cjs /opt/workflow-lazy-tools/
RUN node /opt/workflow-lazy-tools/test.cjs && node /opt/workflow-lazy-tools/patch.cjs
