import type { UserRole } from '@prisma/client';
declare module 'omise';
declare global {
  namespace Express {
    interface Request { auth?: { userId: string; role: UserRole } }
  }
}
export {};
