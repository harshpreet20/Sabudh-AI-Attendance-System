FROM node:20-bookworm-slim

# Headless LibreOffice for PPT/PPTX/DOC/DOCX -> PDF conversion.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice-impress \
        libreoffice-writer \
        libreoffice-calc \
        fonts-liberation \
        fonts-dejavu \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
