FROM nginx:stable-alpine

# Copiar la configuración personalizada de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar los archivos estáticos al directorio raíz de Nginx
COPY index.html /usr/share/nginx/html/
COPY admin.html /usr/share/nginx/html/
COPY stripe-checkout.html /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/

# Exponer el puerto estándar HTTP
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
