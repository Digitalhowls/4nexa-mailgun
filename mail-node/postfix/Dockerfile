FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    postfix \
    postfix-pcre \
    ca-certificates \
    libsasl2-modules \
    && rm -rf /var/lib/apt/lists/*

# Crear usuario y directorios para Maildir virtual
RUN groupadd -g 1000 vmail && useradd -u 1000 -g vmail -d /var/mail -s /sbin/nologin vmail
RUN mkdir -p /var/mail && chown vmail:vmail /var/mail && chmod 700 /var/mail

# Directorios para configuración generada por node-agent
RUN mkdir -p /etc/postfix/virtual /etc/postfix/sasl

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 25 465 587

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["postfix", "start-fg"]
