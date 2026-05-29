FROM node:22.22-alpine AS node-deps
WORKDIR /var/www/html
COPY package.json package-lock.json ./
RUN npm ci

FROM dunglas/frankenphp:1-php8.4-alpine
WORKDIR /var/www/html

RUN apk add --no-cache git unzip nodejs npm \
    && install-php-extensions pdo_mysql pdo_sqlite redis pcntl opcache

COPY --from=composer:2.9 /usr/bin/composer /usr/bin/composer

COPY composer.json composer.lock ./
RUN composer install --no-dev --optimize-autoloader --no-scripts --no-interaction

COPY --from=node-deps /var/www/html/node_modules node_modules
COPY . .
RUN mkdir -p bootstrap/cache storage/framework/sessions storage/framework/views storage/framework/cache storage/logs \
    && cp .env.example .env \
    && php artisan key:generate --force \
    && php artisan package:discover --ansi \
    && npm run build \
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

LABEL org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$APP_PR_NUMBER \
      org.opencontainers.image.ref.name=$APP_BRANCH

ENTRYPOINT ["/entrypoint.sh"]
