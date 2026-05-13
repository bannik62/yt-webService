FROM node:20-bookworm-slim AS build

WORKDIR /app
ARG VITE_FB_APP_ID=
ENV VITE_FB_APP_ID=$VITE_FB_APP_ID

COPY package.json package-lock.json* ./
RUN npm install

COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
