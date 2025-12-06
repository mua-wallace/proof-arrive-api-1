FROM node:22.17.0 AS development

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install

COPY . .

FROM node:22.17.0 AS build

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV production

FROM node:22.17.0 AS production

WORKDIR /usr/src/app

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

CMD [ "node", "dist/main" ]

