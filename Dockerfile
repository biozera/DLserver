# Usa glibc (melhor pros binários do better-sqlite3)
FROM node:20-slim

# Dependências nativas para compilar addons e SQLite
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ sqlite3 libsqlite3-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependências
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copia o resto
COPY . .

# Variáveis padrão (Koyeb vai injetar PORT)
ENV NODE_ENV=production
ENV DB_PATH=/var/data/attacks.db

EXPOSE 8080

# Healthcheck (bate na rota /health)
HEALTHCHECK --interval=30s --timeout=3s --retries=5 CMD \
  node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
