FROM node:20-alpine AS build
WORKDIR /app
ENV VITE_API_BASE=${VITE_API_BASE}
COPY package.json vite.config.js postcss.config.js tailwind.config.js ./
COPY index.html ./index.html
COPY src ./src
RUN npm install --no-audit --no-fund && npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]


