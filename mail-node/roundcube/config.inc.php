<?php
// ─── Roundcube config.inc.php ─────────────────────────────────────────────
// 4nexa Mailgun — Mail Node — Webmail
// Configuración mínima para entorno Docker

$config = [];

// ─── Servidor IMAP ────────────────────────────────────────────────────────
$config['default_host'] = 'dovecot';
$config['default_port'] = 143;
$config['imap_timeout'] = 30;

// ─── Servidor SMTP ────────────────────────────────────────────────────────
$config['smtp_server'] = 'postfix';
$config['smtp_port'] = 587;
$config['smtp_user'] = '%u';
$config['smtp_pass'] = '%p';

// ─── Base de datos (SQLite en Docker local) ───────────────────────────────
$config['db_dsnw'] = 'sqlite:////var/roundcube/db/sqlite.db?mode=0600';

// ─── Seguridad ────────────────────────────────────────────────────────────
$config['des_key'] = getenv('ROUNDCUBE_DES_KEY') ?: 'cambia-esto-en-produccion-32ch';
$config['cipher_method'] = 'AES-256-CBC';

// ─── Idioma ───────────────────────────────────────────────────────────────
$config['language'] = 'es_ES';
$config['timezone'] = 'Europe/Madrid';

// ─── UI ───────────────────────────────────────────────────────────────────
$config['skin'] = 'elastic';
$config['product_name'] = '4nexa Mail';

// ─── Plugins habilitados ──────────────────────────────────────────────────
$config['plugins'] = [
    'archive',
    'zipdownload',
    'managesieve',
    'newmail_notifier',
];

// ─── Opciones de display ──────────────────────────────────────────────────
$config['mail_pagesize'] = 50;
$config['preview_pane'] = true;
$config['delete_junk'] = false;

// ─── Límite de subida de adjuntos (10 MB) ────────────────────────────────
$config['max_message_size'] = '10M';

// ─── Logging ─────────────────────────────────────────────────────────────
$config['log_driver'] = 'stdout';
$config['debug_level'] = 1;
