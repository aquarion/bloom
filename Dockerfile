FROM node:22-alpine AS node-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM dunglas/frankenphp:latest-php8.3-alpine
WORKDIR /app

RUN apk add --no-cache git unzip \
    && install-php-extensions pdo_mysql pdo_sqlite redis pcntl opcache

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

COPY composer.json composer.lock ./
RUN composer install --no-dev --optimize-autoloader --no-scripts --no-interaction

COPY . .
COPY --from=node-builder /app/public/build public/build

RUN chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV OCTANE_PORT=8000
EXPOSE ${OCTANE_PORT}

ENTRYPOINT ["/entrypoint.sh"]
