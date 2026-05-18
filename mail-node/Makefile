# mail-node/Makefile

.PHONY: up down restart logs ps build clean init-dirs

# ─── Levantar el nodo completo ─────────────────────────────────────────────
up:
	@[ -f .env ] || (cp .env.example .env && echo "AVISO: .env creado desde .env.example — edítalo antes de continuar")
	$(MAKE) init-dirs
	docker compose up -d

# ─── Detener y eliminar contenedores ──────────────────────────────────────
down:
	docker compose down

# ─── Reiniciar todos los servicios ────────────────────────────────────────
restart:
	docker compose restart

# ─── Ver logs en tiempo real ───────────────────────────────────────────────
logs:
	docker compose logs -f

# ─── Ver estado de los contenedores ───────────────────────────────────────
ps:
	docker compose ps

# ─── Reconstruir imágenes ─────────────────────────────────────────────────
build:
	docker compose build --no-cache

# ─── Crear directorios necesarios (generados por node-agent) ──────────────
init-dirs:
	mkdir -p postfix/virtual postfix/sasl
	mkdir -p rspamd/dkim rspamd/override.d
	touch dovecot/users.conf

# ─── Eliminar volúmenes (¡BORRA TODOS LOS CORREOS!) ──────────────────────
clean:
	@read -p "ATENCIÓN: esto eliminará todos los datos de correo. ¿Continuar? [s/N] " yn; \
	[ "$$yn" = "s" ] && docker compose down -v || echo "Operación cancelada"

# ─── Health check manual ──────────────────────────────────────────────────
health:
	@echo "=== Postfix ===" && docker exec mailnode-postfix postfix status
	@echo "=== Dovecot ===" && docker exec mailnode-dovecot doveadm service status
	@echo "=== Rspamd ===" && docker exec mailnode-rspamd rspamc stat

# ─── Ver cola de Postfix ──────────────────────────────────────────────────
queue:
	docker exec mailnode-postfix mailq

# ─── Vaciar cola de mensajes diferidos ────────────────────────────────────
flush:
	docker exec mailnode-postfix postqueue -f

# ─── Ver logs de Postfix ──────────────────────────────────────────────────
logs-postfix:
	docker logs -f mailnode-postfix

# ─── Ver logs de Dovecot ──────────────────────────────────────────────────
logs-dovecot:
	docker logs -f mailnode-dovecot

# ─── Ver logs de Rspamd ───────────────────────────────────────────────────
logs-rspamd:
	docker logs -f mailnode-rspamd
