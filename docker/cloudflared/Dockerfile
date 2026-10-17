FROM cloudflare/cloudflared:latest AS cloudflared

FROM alpine:3.20

RUN apk add --no-cache bash curl grep sed coreutils

COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared

WORKDIR /var/www/html

ENTRYPOINT ["/var/www/html/docker/cloudflared/entrypoint.sh"]
