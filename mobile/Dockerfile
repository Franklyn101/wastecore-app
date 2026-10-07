# The WasteCore app's web version, for testing in a browser. (Phones use Expo; see the README.)
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The browser calls the API at this address, so it's fixed when the app is built.
ARG EXPO_PUBLIC_API_URL=http://localhost:4000
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL EXPO_OFFLINE=1 CI=1
RUN npx expo export --platform web --output-dir dist

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
