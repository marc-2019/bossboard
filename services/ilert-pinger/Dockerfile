FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json index.js ./
USER node
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "index.js"]
