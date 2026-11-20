FROM node:22-alpine
WORKDIR /app
RUN chown node:node /app
USER node

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .
EXPOSE 5000
CMD ["node", "index.js"]