FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    rspamd \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Directorio para claves DKIM (gestionado por node-agent)
RUN mkdir -p /etc/rspamd/dkim && chown _rspamd:_rspamd /etc/rspamd/dkim && chmod 700 /etc/rspamd/dkim

# Directorio para configuración generada dinámicamente
RUN mkdir -p /etc/rspamd/local.d /etc/rspamd/override.d

EXPOSE 11332 11333 11334

CMD ["rspamd", "-f", "-u", "_rspamd", "-g", "_rspamd"]
