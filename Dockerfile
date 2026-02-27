FROM nginx:alpine
COPY . /usr/share/nginx/html

# Plantilla con Webhooks específicos para cada consulta
RUN echo 'window.ENV = { \
    WEBHOOK_LOGIN: "${WEBHOOK_LOGIN}", \
    WEBHOOK_BUSCAR_CLIENTE: "${WEBHOOK_BUSCAR_CLIENTE}", \
    WEBHOOK_CARGAR_MATERIALES: "${WEBHOOK_CARGAR_MATERIALES}", \
    WEBHOOK_CARGAR_TECNICOS: "${WEBHOOK_CARGAR_TECNICOS}", \
    WEBHOOK_TICKETS_ANALISTA: "${WEBHOOK_TICKETS_ANALISTA}", \
    WEBHOOK_TICKETS_OPERACIONES: "${WEBHOOK_TICKETS_OPERACIONES}", \
    WEBHOOK_NUEVO_TICKET: "${WEBHOOK_NUEVO_TICKET}", \
    WEBHOOK_INICIAR_SOPORTE: "${WEBHOOK_INICIAR_SOPORTE}", \
    WEBHOOK_CERRAR_TICKET: "${WEBHOOK_CERRAR_TICKET}" \
};' > /usr/share/nginx/html/env.template.js

CMD envsubst < /usr/share/nginx/html/env.template.js > /usr/share/nginx/html/env-config.js && nginx -g "daemon off;"