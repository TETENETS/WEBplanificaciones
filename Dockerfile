FROM nginx:alpine
# Copiamos todos los archivos
COPY . /usr/share/nginx/html

# Plantilla para inyectar variables de entorno en un archivo JS
RUN echo 'window.ENV = { \
    WEBHOOK_NUEVO_TICKET: "${WEBHOOK_NUEVO_TICKET}", \
    WEBHOOK_INICIAR_SOPORTE: "${WEBHOOK_INICIAR_SOPORTE}", \
    WEBHOOK_CARGAR_DATOS: "${WEBHOOK_CARGAR_DATOS}", \
    WEBHOOK_CERRAR_TICKET: "${WEBHOOK_CERRAR_TICKET}" \
};' > /usr/share/nginx/html/env.template.js

# Al iniciar el contenedor, reemplaza las variables y arranca Nginx
CMD envsubst < /usr/share/nginx/html/env.template.js > /usr/share/nginx/html/env-config.js && nginx -g "daemon off;"