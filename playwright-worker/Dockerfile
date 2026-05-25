FROM mcr.microsoft.com/playwright:v1.44.0-jammy

# Directorio de trabajo en el contenedor de Microsoft
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias del proyecto (incluye playwright en la versión correspondiente)
RUN npm ci --only=production

# Copiar todo el código del scraper
COPY . .

# Exponer el puerto de consulta interna
EXPOSE 3001

# Iniciar el servidor Express del worker
CMD ["node", "server.js"]
