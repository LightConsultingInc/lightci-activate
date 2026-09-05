FROM node:22-alpine

WORKDIR /app
COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build

ENV NODE_ENV=production
ENV PORT=3000

# Run as an unprivileged user. Root-owned /app stays readable; writes go to /tmp and $HOME.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nodeuser
USER nodeuser

EXPOSE 3000

CMD ["node", "dist/main.js"]
