import { adminUsers, type AdminUser, type UpsertAdminUser } from "@workspace/db/schema";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<AdminUser | undefined>;
  upsertUser(user: UpsertAdminUser): Promise<AdminUser>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<AdminUser | undefined> {
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return user;
  }

  async upsertUser(userData: UpsertAdminUser): Promise<AdminUser> {
    const [user] = await db
      .insert(adminUsers)
      .values(userData)
      .onConflictDoUpdate({
        target: adminUsers.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }
}

export const authStorage = new AuthStorage();
