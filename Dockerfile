FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS node-deps
WORKDIR /var/www/html
COPY package.json package-lock.json ./
RUN npm ci

# Pinned by digest (not just the floating "1-php8.4-alpine" tag):
# dunglas/frankenphp republishes this tag frequently, which was silently
# invalidating the Docker layer cache for every layer below on every
# build, even when nothing in this repo changed. Dependabot's docker
# ecosystem bumps this digest deliberately.
FROM dunglas/frankenphp:1-php8.4-alpine@sha256:023709d5a92f22540b01353538275ef6b641b2f12f8f8c8325c177d66783bce2
WORKDIR /var/www/html

ARG APP_ENV=production
ARG APP_NAME=Bloom

RUN apk add --no-cache git unzip \
    && install-php-extensions pdo_mysql pdo_sqlite redis pcntl opcache opentelemetry

# Copy the exact Node 26 binaries from the node-deps stage so that npm ci
# and npm run build use the same toolchain (wayfinder needs PHP at build time,
# so the Vite build must run here where PHP is available).
# npm/npx are symlinks in the node image; copy the package then recreate them
# so the relative require() paths inside npm-cli.js resolve correctly.
COPY --from=node-deps /usr/local/bin/node /usr/local/bin/node
COPY --from=node-deps /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

COPY --from=composer:2.9@sha256:b09bccd91a78fe8a9ab4b33d707b862e8fe54fec17782e32683ad2a69c46867d /usr/bin/composer /usr/bin/composer

COPY composer.json composer.lock ./
RUN composer install --no-dev --optimize-autoloader --no-scripts --no-interaction

COPY --from=node-deps /var/www/html/node_modules node_modules
COPY . .
RUN mkdir -p bootstrap/cache storage/framework/sessions storage/framework/views storage/framework/cache storage/logs \
    && cp .env.example .env \
    && php artisan key:generate --force \
    && php artisan package:discover --ansi \
    && APP_ENV=$APP_ENV VITE_APP_NAME=$APP_NAME npm run build \
    && rm .env \
    && rm -rf node_modules

RUN chown -R www-data:www-data storage bootstrap/cache public \
    && chmod -R 775 storage bootstrap/cache

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER www-data

ENV OCTANE_PORT=8000
EXPOSE ${OCTANE_PORT}

ARG APP_VERSION=dev
ARG APP_PR_NUMBER=
ARG APP_BRANCH=

ENV APP_VERSION=$APP_VERSION
ENV APP_PR_NUMBER=$APP_PR_NUMBER
ENV APP_BRANCH=$APP_BRANCH

ENV OTEL_RESOURCE_ATTRIBUTES="service.version=$APP_VERSION,service.environment=$APP_ENV,service.name=$APP_NAME,service.revision=$APP_PR_NUMBER,service.branch=$APP_BRANCH"

LABEL org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$APP_PR_NUMBER \
      org.opencontainers.image.ref.name=$APP_BRANCH

ENTRYPOINT ["/entrypoint.sh"]
