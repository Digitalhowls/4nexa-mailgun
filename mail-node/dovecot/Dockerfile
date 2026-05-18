FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    dovecot-core \
    dovecot-imapd \
    dovecot-lmtpd \
    dovecot-sieve \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Usuario virtual para buzones
RUN groupadd -g 1000 vmail && useradd -u 1000 -g vmail -d /var/mail -s /sbin/nologin vmail
RUN mkdir -p /var/mail && chown vmail:vmail /var/mail && chmod 700 /var/mail

# Directorio para el archivo users.conf (generado por node-agent)
RUN touch /etc/dovecot/users.conf && chmod 600 /etc/dovecot/users.conf

EXPOSE 143 993 24 8994

CMD ["dovecot", "-F"]
