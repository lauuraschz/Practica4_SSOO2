# SpotESIfy API — Dockerfile
FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev && npm cache clean --force

COPY . .

RUN chown -R node:node /app

HEALTHCHECK --interval=5s --timeout=2s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1
  
USER node

EXPOSE 5000

CMD ["npm", "start"]
