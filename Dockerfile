# Node fixado na versão exata; o app não tem dependências de execução (node:sqlite embutido).
FROM node:24.22.2-alpine

LABEL projeto=partidou
ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY compartilhado ./compartilhado
COPY server ./server
COPY public ./public

USER node
EXPOSE 8791

# wget do busybox: sem dependência extra na imagem. /saude consulta o banco.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --start-interval=2s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8791/saude || exit 1

CMD ["node", "server/main.js"]
