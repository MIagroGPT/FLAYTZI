FROM node:20-alpine

# Directorio de trabajo en el contenedor
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production

# Copiar el resto del código del backend
COPY . .

# Exponer el puerto del API
EXPOSE 4000

# Comando para arrancar el servidor
CMD ["node", "server.js"]
