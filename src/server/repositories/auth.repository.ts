import type { AuthUser, UserRole } from "../../shared/auth";
import type { CurrentSession } from "../types/app";

type UserRow = AuthUser & { password_hash: string; status: string };
export type SessionRow = { session_id: string; user_id: string; shop_id: string | null; user_shop_id: string | null; token_hash: string; expires_at: string; name: string; email: string; phone: string | null; avatar_url:string|null; role: UserRole };

export class AuthRepository {
  constructor(private readonly db: D1Database) {}

  findLoginUser(email: string, shopId: string | null): Promise<UserRow | null> {
    const query = shopId === null
      ? "SELECT id, name, email, phone, avatar_url, role, shop_id, password_hash, status FROM users WHERE email = ? AND shop_id IS NULL AND role = 'SUPER_ADMIN' LIMIT 1"
      : "SELECT id, name, email, phone, avatar_url, role, shop_id, password_hash, status FROM users WHERE email = ? AND shop_id = ? LIMIT 1";
    const statement = shopId === null ? this.db.prepare(query).bind(email) : this.db.prepare(query).bind(email, shopId);
    return statement.first<UserRow>();
  }

  findByEmail(email: string, shopId: string): Promise<{ id: string } | null> {
    return this.db.prepare("SELECT id FROM users WHERE email = ? AND shop_id = ? LIMIT 1").bind(email, shopId).first();
  }

  async createCustomer(input: { id: string; shopId: string; name: string; email: string; phone: string | null; passwordHash: string }): Promise<AuthUser> {
    await this.db.prepare("INSERT INTO users (id, shop_id, name, email, phone, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, 'CUSTOMER', 'ACTIVE')")
      .bind(input.id, input.shopId, input.name, input.email, input.phone, input.passwordHash).run();
    return { id: input.id, name: input.name, email: input.email, phone: input.phone, avatar_url:null, role: "CUSTOMER", shop_id: input.shopId };
  }

  async claimOwnerInvite(shopId:string,tokenHash:string,passwordHash:string):Promise<boolean>{
    const result=await this.db.batch([
      this.db.prepare(`UPDATE owner_invites SET used_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE shop_id=? AND token_hash=? AND used_at IS NULL AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(shopId,tokenHash),
      this.db.prepare(`UPDATE users SET password_hash=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=(SELECT user_id FROM owner_invites WHERE shop_id=? AND token_hash=? AND used_at IS NOT NULL)
          AND shop_id=? AND role='SHOP_OWNER' AND changes()=1`).bind(passwordHash,shopId,tokenHash,shopId),
    ]);
    return result[1]?.meta.changes===1;
  }

  async createSession(session: CurrentSession): Promise<void> {
    await this.db.prepare("INSERT INTO sessions (id, user_id, shop_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)")
      .bind(session.id, session.userId, session.shopId, session.tokenHash, session.expiresAt).run();
  }

  async findSession(tokenHash: string): Promise<SessionRow | null> {
    return this.db.prepare(`SELECT s.id AS session_id, s.user_id, s.shop_id, s.token_hash, s.expires_at,
      u.id AS user_id, u.name, u.email, u.phone, u.avatar_url, u.role, u.shop_id AS user_shop_id
      FROM sessions s JOIN users u ON u.id = s.user_id AND u.shop_id IS s.shop_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'ACTIVE' LIMIT 1`)
      .bind(tokenHash, new Date().toISOString()).first<SessionRow>();
  }

  async revokeSession(id: string): Promise<void> {
    await this.db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").bind(new Date().toISOString(), id).run();
  }

  async rotateSession(oldId: string, session: CurrentSession): Promise<boolean> {
    const result = await this.db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
      .bind(new Date().toISOString(), oldId).run();
    if (result.meta.changes !== 1) return false;
    await this.createSession(session);
    return true;
  }
}
