FROM twenty-opportunity-ui:20261006-calendar-complete
USER root
COPY patch.cjs /opt/workflow-lazy-tools/frontend-hydration-patch.cjs
RUN node /opt/workflow-lazy-tools/frontend-hydration-patch.cjs
LABEL crm.frontend.hydration.repair=bounded-idb-hydration-20261012
USER 1000
