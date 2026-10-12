FROM twenty-opportunity-ui:20261012-idb-hydration
USER root
COPY patch.cjs /opt/workflow-lazy-tools/dashboard-ux-patch.cjs
RUN node /opt/workflow-lazy-tools/dashboard-ux-patch.cjs
LABEL crm.dashboard.ux.repair=date-null-empty-wrap-20261012
USER 1000
