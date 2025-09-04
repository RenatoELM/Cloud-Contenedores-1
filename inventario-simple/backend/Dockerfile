FROM node:20-alpine
WORKDIR /app

# Copia solo los manifiestos primero (mejor cache)
COPY package*.json ./

# Instala dependencias de produccion sin lockfile
RUN npm install --omit=dev

# Copia el codigo
COPY server.js ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
