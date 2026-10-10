FROM node:24-bookworm-slim
WORKDIR /app
COPY apps/mobile-server/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir /app/data && chown node:node /app/data
COPY apps/mobile-server/src ./src
USER node
ENV MOBILE_HOST=0.0.0.0 MOBILE_DATABASE=/app/data/mobile.sqlite
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/main.ts"]
