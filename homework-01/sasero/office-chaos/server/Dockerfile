FROM node:22-slim

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

EXPOSE 4000

# `db push` syncs the schema on boot (MVP — replace with `migrate deploy` once migrations are baselined)
CMD ["sh", "-c", "npx prisma db push --skip-generate && node src/index.js"]
