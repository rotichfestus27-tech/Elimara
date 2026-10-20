export type { IdentityStore } from "@elimara/database";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface PasswordResetDelivery {
  sendPasswordReset(email: string, token: string): Promise<void>;
}
