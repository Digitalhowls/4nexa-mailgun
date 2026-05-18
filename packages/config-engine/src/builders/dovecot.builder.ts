import type { MailboxConfigData, DovecotParams } from '../types';

/**
 * Construye los parámetros de configuración para Dovecot.
 *
 * Dovecot usa una base de datos de usuarios/contraseñas para:
 * - passdb: autenticación IMAP/SASL (contraseñas Argon2id)
 * - userdb: asignación de cuota y directorio home
 *
 * El node agent genera los archivos de configuración de passdb/userdb
 * a partir de estos parámetros (driver: passwd-file o SQL, según implementación).
 *
 * Formato del passwordHash: Dovecot acepta Argon2id con el prefijo {ARGON2ID}.
 * El hash generado por argon2 ya tiene el formato $argon2id$... que Dovecot
 * reconoce directamente si se usa el scheme ARGON2ID.
 *
 * @param mailboxes Buzones ACTIVE del nodo con hash de contraseña incluido
 */
export function buildDovecotParams(mailboxes: MailboxConfigData[]): DovecotParams {
  const users = mailboxes
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({
      username: `${m.localPart}@${m.domain}`,
      // Prefijo para Dovecot password scheme
      passwordHash: `{ARGON2ID}${m.passwordHash}`,
      // Convertir BigInt a string para serialización JSON segura
      quotaBytes: m.quotaBytes.toString(),
      // Directorio home estandarizado: /var/mail/<domain>/<localPart>
      homeDir: `/var/mail/${m.domain}/${m.localPart}`,
    }));

  return { users };
}
