# Imagem única para publicar (Render, Railway, Cloud Run, Fly…): compila o frontend e arranca o servidor.
# Os dados (dados/*.csv) vão dentro da imagem; o estado vive em memória — usar UMA instância.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 8080
ENV PORT=8080
CMD ["npx", "tsx", "server.ts"]
