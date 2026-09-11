import 'dotenv/config';

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import {
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { Server } from 'socket.io';
import { z } from 'zod';
import Omise from 'omise';
import multer from 'multer';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();
const app = express();
const uploadsDir = path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
});
const r2Configured = Boolean(
  process.env.R2_ENDPOINT &&
  process.env.R2_BUCKET &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_PUBLIC_BASE_URL,
);
const r2 = r2Configured
  ? new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;
const server = http.createServer(app);

const port = Number(process.env.PORT ?? 4000);
const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
const jwtSecret = process.env.JWT_SECRET ?? '';

if (jwtSecret.length < 32) {
  throw new Error(
    'JWT_SECRET must contain at least 32 characters',
  );
}

if (
  !process.env.OPN_PUBLIC_KEY ||
  !process.env.OPN_SECRET_KEY
) {
  console.warn(
    'OPN_PUBLIC_KEY or OPN_SECRET_KEY is missing. Payment APIs will not work.',
  );
}

const omise = Omise({
  publicKey: process.env.OPN_PUBLIC_KEY ?? '',
  secretKey: process.env.OPN_SECRET_KEY ?? '',
});

const io = new Server(server, {
  cors: {
    origin: appUrl,
    methods: ['GET', 'POST'],
  },
});

/*
 * จำกัด origin ตาม APP_URL เพื่อไม่เปิด API ให้ทุกเว็บไซต์ใน production
 */
app.use(
  cors({
    origin: appUrl,
    methods: [
      'GET',
      'POST',
      'PATCH',
      'PUT',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
    ],
  }),
);
app.use('/uploads', express.static(uploadsDir));

app.use(helmet());

/*
 * Webhook ต้องอ่าน request body แบบ raw ก่อน express.json()
 */
app.use(
  '/api/payments/webhook',
  express.raw({
    type: 'application/json',
  }),
);

app.use(
  express.json({
    limit: '1mb',
  }),
);

interface AuthTokenPayload extends jwt.JwtPayload {
  sub: string;
  role: UserRole;
}

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

const asyncRoute = (
  handler: AsyncHandler,
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

const signToken = (
  userId: string,
  role: UserRole,
): string => {
  return jwt.sign(
    {
      sub: userId,
      role,
    },
    jwtSecret,
    {
      expiresIn: '7d',
      issuer: 'ninechang',
    },
  );
};

const isProviderRole = (role: UserRole) =>
  role === 'PROFESSIONAL' || role === 'CONTRACTOR';

const auth: RequestHandler = (req, res, next) => {
  try {
    const authorization = req.headers.authorization;
    const token = authorization?.replace(
      /^Bearer\s+/i,
      '',
    );

    if (!token) {
      res.status(401).json({
        message: 'กรุณาเข้าสู่ระบบ',
      });
      return;
    }

    const payload = jwt.verify(
      token,
      jwtSecret,
      {
        issuer: 'ninechang',
      },
    ) as AuthTokenPayload;

    if (!payload.sub || !payload.role) {
      res.status(401).json({
        message: 'ข้อมูลเซสชันไม่ถูกต้อง',
      });
      return;
    }

    req.auth = {
      userId: String(payload.sub),
      role: payload.role,
    };

    next();
  } catch {
    res.status(401).json({
      message: 'เซสชันไม่ถูกต้องหรือหมดอายุ',
    });
  }
};

/* -------------------------------------------------------------------------- */
/* Health                                                                      */
/* -------------------------------------------------------------------------- */

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ninechang-api',
  });
});

/* -------------------------------------------------------------------------- */
/* Authentication                                                              */
/* -------------------------------------------------------------------------- */

app.post(
  '/api/auth/register',
  asyncRoute(async (req, res) => {
    const input = z
      .object({
        email: z.string().trim().email(),
        password: z.string().min(8).max(128),
        displayName: z.string().trim().min(2).max(100),
        role: z
        .enum(['CUSTOMER', 'PROFESSIONAL', 'CONTRACTOR'])
          .default('CUSTOMER'),
      })
      .parse(req.body);

    const normalizedEmail = input.email.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (existingUser) {
      res.status(409).json({
        message: 'อีเมลนี้ถูกสมัครใช้งานแล้ว',
      });
      return;
    }

    const passwordHash = await argon2.hash(
      input.password,
    );

    /*
     * ห้ามใช้ ...input ตรงนี้ เพราะ input มี password
     * และตาราง User ไม่มี field password
     */
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        displayName: input.displayName,
        role: input.role,
        passwordHash,

        professional:
          input.role !== 'CUSTOMER'
            ? {
                create: {},
              }
            : undefined,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
      },
    });

    res.status(201).json({
      user,
      token: signToken(user.id, user.role),
    });
  }),
);

app.post(
  '/api/auth/login',
  asyncRoute(async (req, res) => {
    const input = z
      .object({
        email: z.string().trim().email(),
        password: z.string().min(1),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: {
        email: input.email.toLowerCase(),
      },
    });

    if (!user) {
      res.status(401).json({
        message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      });
      return;
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      input.password,
    );

    if (!passwordMatches) {
      res.status(401).json({
        message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
      });
      return;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
      token: signToken(user.id, user.role),
    });
  }),
);

app.post('/api/auth/forgot-password', asyncRoute(async (req, res) => {
  const input = z.object({ email: z.string().trim().email() }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() }, select: { id: true } });
  const response: { message: string; resetToken?: string } = {
    message: 'หากอีเมลนี้มีบัญชีอยู่ ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ให้',
  };
  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'), expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
    });
    if (process.env.NODE_ENV !== 'production') response.resetToken = rawToken;
  }
  res.json(response);
}));

app.post('/api/auth/reset-password', asyncRoute(async (req, res) => {
  const input = z.object({ token: z.string().length(64), newPassword: z.string().min(8).max(128) }).parse(req.body);
  const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');
  const resetToken = await prisma.passwordResetToken.findFirst({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } } });
  if (!resetToken) {
    res.status(400).json({ message: 'ลิงก์รีเซ็ตไม่ถูกต้องหรือหมดอายุแล้ว' });
    return;
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash: await argon2.hash(input.newPassword) } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: resetToken.userId, id: { not: resetToken.id } } }),
  ]);
  res.json({ message: 'ตั้งรหัสผ่านใหม่สำเร็จ' });
}));

app.get(
  '/api/me',
  auth,
  asyncRoute(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: {
        id: req.auth!.userId,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        displayName: true,
        role: true,
        professional: true,
      },
    });

    if (!user) {
      res.status(404).json({
        message: 'ไม่พบบัญชีผู้ใช้',
      });
      return;
    }

    res.json(user);
  }),
);

app.patch(
  '/api/me',
  auth,
  asyncRoute(async (req, res) => {
    const input = z.object({
      displayName: z.string().trim().min(2).max(100),
      phone: z.string().trim().max(30).nullable().optional(),
    }).parse(req.body);
    const phone = input.phone?.trim() || null;
    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { displayName: input.displayName, phone },
      select: { id: true, email: true, phone: true, displayName: true, role: true },
    });
    res.json(user);
  }),
);

app.patch(
  '/api/me/professional-profile',
  auth,
  asyncRoute(async (req, res) => {
    if (!isProviderRole(req.auth!.role)) {
      res.status(403).json({ message: 'เฉพาะบัญชีช่างเท่านั้น' });
      return;
    }
    const input = z.object({
      bio: z.string().trim().max(2000),
    }).parse(req.body);
    const profile = await prisma.professionalProfile.update({
      where: { userId: req.auth!.userId },
      data: { bio: input.bio || null },
      select: { bio: true, verified: true, kycStatus: true, bankLast4: true },
    });
    res.json(profile);
  }),
);

app.get('/api/portfolio', auth, asyncRoute(async (req, res) => {
  if (!isProviderRole(req.auth!.role)) { res.status(403).json({ message: 'เฉพาะบัญชีช่างหรือผู้รับเหมาเท่านั้น' }); return; }
  res.json(await prisma.portfolioItem.findMany({ where: { professionalId: req.auth!.userId }, orderBy: { createdAt: 'desc' } }));
}));

app.post('/api/portfolio', auth, upload.single('image'), asyncRoute(async (req, res) => {
  if (!isProviderRole(req.auth!.role)) { res.status(403).json({ message: 'เฉพาะบัญชีช่างหรือผู้รับเหมาเท่านั้น' }); return; }
  const input = z.object({ title: z.string().trim().min(2).max(150), description: z.string().trim().max(2000).optional() }).parse(req.body);
  let imageUrl: string | null = null;
  if (req.file) {
    if (!r2) { res.status(503).json({ message: 'ยังไม่ได้ตั้งค่าที่เก็บรูปภาพ' }); return; }
    const key = `portfolio/${req.auth!.userId}/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }));
    imageUrl = `${process.env.R2_PUBLIC_BASE_URL!.replace(/\/$/, '')}/${key}`;
  }
  res.status(201).json(await prisma.portfolioItem.create({ data: { ...input, imageUrl, professionalId: req.auth!.userId } }));
}));

app.delete('/api/portfolio/:itemId', auth, asyncRoute(async (req, res) => {
  const item = await prisma.portfolioItem.findFirst({ where: { id: String(req.params.itemId), professionalId: req.auth!.userId }, select: { id: true } });
  if (!item) { res.status(404).json({ message: 'ไม่พบผลงานที่ต้องการลบ' }); return; }
  await prisma.portfolioItem.delete({ where: { id: item.id } });
  res.status(204).end();
}));

app.post(
  '/api/me/password',
  auth,
  asyncRoute(async (req, res) => {
    const input = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { passwordHash: true } });
    if (!user || !(await argon2.verify(user.passwordHash, input.currentPassword))) {
      res.status(400).json({ message: 'รหัสผ่านเดิมไม่ถูกต้อง' });
      return;
    }
    await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { passwordHash: await argon2.hash(input.newPassword) },
    });
    res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
  }),
);

app.post(
  '/api/me/pin',
  auth,
  asyncRoute(async (req, res) => {
    const input = z.object({
      currentPin: z.string().regex(/^\d{6}$/).optional(),
      pin: z.string().regex(/^\d{6}$/),
    }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { pinHash: true } });
    if (user?.pinHash && (!input.currentPin || !(await argon2.verify(user.pinHash, input.currentPin)))) {
      res.status(400).json({ message: 'PIN เดิมไม่ถูกต้อง' });
      return;
    }
    await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { pinHash: await argon2.hash(input.pin) },
    });
    res.json({ message: user?.pinHash ? 'เปลี่ยน PIN สำเร็จ' : 'ตั้ง PIN สำเร็จ' });
  }),
);

app.get(
  '/api/services',
  auth,
  asyncRoute(async (req, res) => {
    if (!isProviderRole(req.auth!.role)) {
      res.status(403).json({ message: 'เฉพาะบัญชีช่างเท่านั้น' });
      return;
    }
    const services = await prisma.service.findMany({
      where: { professionalId: req.auth!.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(services);
  }),
);

app.get(
  '/api/services/public',
  asyncRoute(async (_req, res) => {
    const services = await prisma.service.findMany({
      select: {
        id: true,
        title: true,
        category: true,
        description: true,
        amount: true,
        createdAt: true,
        professional: {
          select: { displayName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    res.json(services);
  }),
);

app.post(
  '/api/services/:serviceId/contact',
  auth,
  asyncRoute(async (req, res) => {
    if (req.auth!.role !== 'CUSTOMER') {
      res.status(403).json({ message: 'เฉพาะลูกค้าเท่านั้น' });
      return;
    }
    const service = await prisma.service.findUnique({
      where: { id: String(req.params.serviceId) },
      select: { professionalId: true, title: true, category: true, description: true, amount: true },
    });
    if (!service) {
      res.status(404).json({ message: 'ไม่พบบริการที่ต้องการติดต่อ' });
      return;
    }
    const existingJob = await prisma.job.findFirst({
      where: {
        customerId: req.auth!.userId,
        professionalId: service.professionalId,
        status: { in: ['OPEN', 'QUOTED', 'ACCEPTED', 'IN_PROGRESS'] },
      },
      select: { room: { select: { id: true } } },
    });
    if (existingJob?.room) {
      res.json({ roomId: existingJob.room.id });
      return;
    }
    const job = await prisma.job.create({
      data: {
        customerId: req.auth!.userId,
        professionalId: service.professionalId,
        title: `สอบถามบริการ: ${service.title}`,
        category: service.category,
        description: service.description,
        amount: service.amount,
        status: 'OPEN',
        room: { create: {} },
      },
      select: { room: { select: { id: true } } },
    });
    res.status(201).json({ roomId: job.room.id });
  }),
);

app.post(
  '/api/services',
  auth,
  asyncRoute(async (req, res) => {
    if (!isProviderRole(req.auth!.role)) {
      res.status(403).json({ message: 'เฉพาะบัญชีช่างเท่านั้น' });
      return;
    }
    const input = z.object({
      title: z.string().trim().min(3).max(200),
      category: z.string().trim().min(2).max(100).default('อื่นๆ'),
      description: z.string().trim().min(10).max(5000),
      amount: z.number().int().min(100),
    }).parse(req.body);
    const service = await prisma.service.create({
      data: { ...input, professionalId: req.auth!.userId },
    });
    res.status(201).json(service);
  }),
);

app.delete(
  '/api/services/:serviceId',
  auth,
  asyncRoute(async (req, res) => {
    if (!isProviderRole(req.auth!.role)) {
      res.status(403).json({ message: 'เฉพาะบัญชีช่างเท่านั้น' });
      return;
    }
    const service = await prisma.service.findFirst({
      where: { id: String(req.params.serviceId), professionalId: req.auth!.userId },
      select: { id: true },
    });
    if (!service) {
      res.status(404).json({ message: 'ไม่พบบริการที่ต้องการลบ' });
      return;
    }
    await prisma.service.delete({ where: { id: service.id } });
    res.status(204).end();
  }),
);

app.put(
  '/api/services/:serviceId',
  auth,
  asyncRoute(async (req, res) => {
    if (!isProviderRole(req.auth!.role)) {
      res.status(403).json({ message: 'เฉพาะบัญชีช่างเท่านั้น' });
      return;
    }
    const input = z.object({
      title: z.string().trim().min(3).max(200),
      category: z.string().trim().min(2).max(100),
      description: z.string().trim().min(10).max(5000),
      amount: z.number().int().min(100),
    }).parse(req.body);
    const serviceId = String(req.params.serviceId);
    const service = await prisma.service.findFirst({
      where: { id: serviceId, professionalId: req.auth!.userId },
      select: { id: true },
    });
    if (!service) {
      res.status(404).json({ message: 'ไม่พบบริการที่ต้องการแก้ไข' });
      return;
    }
    const updated = await prisma.service.update({
      where: { id: service.id },
      data: input,
    });
    res.json(updated);
  }),
);

/* -------------------------------------------------------------------------- */
/* Professional payout account                                                 */
/* -------------------------------------------------------------------------- */

app.post(
  '/api/professional/payout-account',
  auth,
  asyncRoute(async (req, res) => {
    if (!isProviderRole(req.auth!.role)) {
      res.status(403).json({
        message: 'เฉพาะบัญชีช่างเท่านั้น',
      });
      return;
    }

    const input = z
      .object({
        name: z.string().trim().min(2),
        email: z.string().trim().email(),
        bankBrand: z.string().trim().min(2),
        accountNumber: z
          .string()
          .regex(/^\d{8,16}$/),
        accountName: z.string().trim().min(2),
      })
      .parse(req.body);

    const recipient = await omise.recipients.create({
      name: input.name,
      email: input.email,
      type: 'individual',

      bank_account: {
        brand: input.bankBrand,
        number: input.accountNumber,
        name: input.accountName,
      },
    });

    const profile =
      await prisma.professionalProfile.update({
        where: {
          userId: req.auth!.userId,
        },
        data: {
          opnRecipientId: recipient.id,
          bankLast4: input.accountNumber.slice(-4),
          kycStatus: recipient.verified
            ? 'VERIFIED'
            : 'PENDING',
        },
        select: {
          bankLast4: true,
          kycStatus: true,
        },
      });

    res.json(profile);
  }),
);

/* -------------------------------------------------------------------------- */
/* Jobs                                                                        */
/* -------------------------------------------------------------------------- */

app.post(
  '/api/jobs',
  auth,
  asyncRoute(async (req, res) => {
    if (req.auth!.role !== 'CUSTOMER') {
      res.status(403).json({
        message: 'เฉพาะลูกค้าเท่านั้น',
      });
      return;
    }

    const input = z
      .object({
        title: z.string().trim().min(3).max(200),
        category: z.string().trim().min(2).max(100).default('อื่นๆ'),
        description: z
          .string()
          .trim()
          .min(10)
          .max(5000),

        /*
         * จำนวนเงินใช้หน่วยสตางค์
         * 2000 = 20 บาท
         */
        amount: z.number().int().min(2000),

        professionalId: z.string().optional(),
      })
      .parse(req.body);

    if (input.professionalId) {
      const professional =
        await prisma.user.findFirst({
          where: {
            id: input.professionalId,
            role: { in: ['PROFESSIONAL', 'CONTRACTOR'] },
          },
          select: {
            id: true,
          },
        });

      if (!professional) {
        res.status(400).json({
          message: 'ไม่พบบัญชีช่างที่เลือก',
        });
        return;
      }
    }

    const job = await prisma.job.create({
      data: {
        title: input.title,
        category: input.category,
        description: input.description,
        amount: input.amount,
        professionalId: input.professionalId,
        customerId: req.auth!.userId,

        room: {
          create: {},
        },
      },
      include: {
        room: true,
      },
    });

    res.status(201).json(job);
  }),
);

app.get(
  '/api/jobs',
  auth,
  asyncRoute(async (req, res) => {
    const userId = req.auth!.userId;

    const jobs = await prisma.job.findMany({
      where: {
        OR: [
          {
            customerId: userId,
          },
          {
            professionalId: userId,
          },
          {
            applications: { some: { professionalId: userId } },
          },
        ],
      },
      include: {
        payment: true,
        room: true,
        review: true,
        applications: {
          include: {
            professional: {
              select: {
                id: true,
                displayName: true,
                professional: { select: { bio: true, verified: true } },
                _count: { select: { professionalReviews: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    res.json(jobs);
  }),
);

app.post(
  '/api/jobs/:jobId/review',
  auth,
  asyncRoute(async (req, res) => {
    const input = z.object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(1000).optional(),
    }).parse(req.body);
    const job = await prisma.job.findFirst({
      where: { id: String(req.params.jobId), customerId: req.auth!.userId, status: 'COMPLETED', professionalId: { not: null } },
      select: { id: true, professionalId: true },
    });
    if (!job || !job.professionalId) {
      res.status(400).json({ message: 'รีวิวได้เฉพาะงานที่เสร็จแล้วและมีช่างเท่านั้น' });
      return;
    }
    const existingReview = await prisma.review.findUnique({ where: { jobId: job.id }, select: { id: true } });
    if (existingReview) {
      res.status(409).json({ message: 'งานนี้ส่งรีวิวไปแล้ว' });
      return;
    }
    const review = await prisma.review.create({
      data: { jobId: job.id, customerId: req.auth!.userId, professionalId: job.professionalId, rating: input.rating, comment: input.comment || null },
    });
    res.status(201).json(review);
  }),
);

app.get(
  '/api/professionals/public',
  asyncRoute(async (_req, res) => {
    const professionals = await prisma.user.findMany({
      where: { role: { in: ['PROFESSIONAL', 'CONTRACTOR'] } },
      select: {
        id: true, role: true, displayName: true, professional: { select: { bio: true, verified: true } },
        services: { select: { title: true, category: true, amount: true }, orderBy: { createdAt: 'desc' }, take: 5 },
        _count: { select: { professionalReviews: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const result = await Promise.all(professionals.map(async (professional) => {
      const aggregate = await prisma.review.aggregate({ where: { professionalId: professional.id }, _avg: { rating: true } });
      return { ...professional, rating: aggregate._avg.rating ?? 0, reviews: professional._count.professionalReviews };
    }));
    res.json(result);
  }),
);

app.get(
  '/api/professionals/:professionalId/public',
  asyncRoute(async (req, res) => {
    const professional = await prisma.user.findFirst({
      where: { id: String(req.params.professionalId), role: { in: ['PROFESSIONAL', 'CONTRACTOR'] } },
      select: {
        id: true,
        role: true,
        displayName: true,
        professional: { select: { bio: true, verified: true, kycStatus: true } },
        services: { orderBy: { createdAt: 'desc' } },
        portfolioItems: { orderBy: { createdAt: 'desc' } },
        professionalReviews: {
          select: { rating: true, comment: true, createdAt: true, customer: { select: { displayName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!professional) {
      res.status(404).json({ message: 'ไม่พบโปรไฟล์ช่าง' });
      return;
    }
    const rating = professional.professionalReviews.length
      ? professional.professionalReviews.reduce((total, review) => total + review.rating, 0) / professional.professionalReviews.length
      : 0;
    res.json({ ...professional, rating, reviews: professional.professionalReviews.length });
  }),
);

app.get(
  '/api/jobs/public',
  asyncRoute(async (_req, res) => {
    const jobs = await prisma.job.findMany({
      where: {
        status: 'OPEN',
        professionalId: null,
      },
      select: {
        id: true,
        title: true,
        category: true,
        description: true,
        amount: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20,
    });

    res.json(jobs);
  }),
);

app.get(
  '/api/jobs/available',
  auth,
  asyncRoute(async (req, res) => {
    if (!isProviderRole(req.auth!.role)) {
      res.status(403).json({
        message: 'เฉพาะบัญชีช่างเท่านั้น',
      });
      return;
    }

    const jobs = await prisma.job.findMany({
      where: {
        professionalId: null,
        status: 'OPEN',
      },
      include: {
        room: true,
        customer: {
          select: {
            displayName: true,
          },
        },
        applications: {
          where: { professionalId: req.auth!.userId },
          select: { status: true },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(jobs.map(({ applications, ...job }) => ({
      ...job,
      applicationStatus: applications[0]?.status ?? null,
    })));
  }),
);

app.post(
  '/api/jobs/:jobId/claim',
  auth,
  asyncRoute(async (req, res) => {
    if (!isProviderRole(req.auth!.role)) {
      res.status(403).json({
        message: 'เฉพาะบัญชีช่างเท่านั้น',
      });
      return;
    }

    const job = await prisma.job.findFirst({
      where: {
        id: String(req.params.jobId),
        professionalId: null,
        status: 'OPEN',
        applications: { none: { professionalId: req.auth!.userId } },
      },
    });

    if (!job) {
      res.status(409).json({
        message: 'งานนี้ถูกรับไปแล้วหรือไม่เปิดรับงาน',
      });
      return;
    }

    const application = await prisma.jobApplication.create({
      data: {
        jobId: job.id,
        professionalId: req.auth!.userId,
      },
      include: {
        professional: {
          select: {
            id: true,
            displayName: true,
            professional: { select: { bio: true, verified: true } },
            _count: { select: { professionalReviews: true } },
          },
        },
      },
    });

    const room = await prisma.chatRoom.findUnique({
      where: { jobId: job.id },
    });
    const messageBody = `ช่าง ${application.professional.displayName} ได้กดรับงานนี้แล้ว ลูกค้าสามารถตรวจสอบโปรไฟล์และเลือกช่างได้`;
    let automaticMessage = null;
    if (room) {
      automaticMessage = await prisma.message.create({
        data: {
          roomId: room.id,
          senderId: req.auth!.userId,
          body: messageBody,
        },
        include: {
          sender: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
      });
      io.to(room.id).emit('message:new', automaticMessage);
    }
    io.to(job.customerId).emit('job:application:new', {
      jobId: job.id,
      application,
      message: automaticMessage,
    });

    const appliedJob = await prisma.job.findUnique({
      where: { id: job.id },
      include: {
        room: true,
        payment: true,
        applications: {
          include: {
            professional: {
              select: {
                id: true,
                displayName: true,
                professional: { select: { bio: true, verified: true } },
                _count: { select: { professionalReviews: true } },
              },
            },
          },
        },
      },
    });
    res.json({ ...appliedJob, applicationStatus: 'PENDING' });
  }),
);

app.post(
  '/api/jobs/:jobId/select-provider',
  auth,
  asyncRoute(async (req, res) => {
    if (req.auth!.role !== 'CUSTOMER') {
      res.status(403).json({ message: 'เฉพาะเจ้าของงานเท่านั้น' });
      return;
    }
    const input = z.object({ professionalId: z.string().min(1) }).parse(req.body);
    const job = await prisma.job.findFirst({
      where: { id: String(req.params.jobId), customerId: req.auth!.userId, status: 'OPEN' },
      select: { id: true },
    });
    if (!job) {
      res.status(404).json({ message: 'ไม่พบงานหรือไม่สามารถเลือกช่างได้' });
      return;
    }
    const application = await prisma.jobApplication.findUnique({
      where: { jobId_professionalId: { jobId: job.id, professionalId: input.professionalId } },
    });
    if (!application) {
      res.status(404).json({ message: 'ช่างคนนี้ยังไม่ได้กดรับงาน' });
      return;
    }
    const selectedJob = await prisma.$transaction(async (transaction) => {
      await transaction.jobApplication.updateMany({
        where: { jobId: job.id },
        data: { status: 'REJECTED' },
      });
      await transaction.jobApplication.update({
        where: { id: application.id },
        data: { status: 'SELECTED' },
      });
      return transaction.job.update({
        where: { id: job.id },
        data: { professionalId: input.professionalId, status: 'ACCEPTED' },
        include: { room: true, payment: true, applications: true },
      });
    });
    res.json(selectedJob);
  }),
);

app.patch(
  '/api/jobs/:jobId/status',
  auth,
  asyncRoute(async (req, res) => {
    const input = z
      .object({
        status: z.enum([
          'OPEN',
          'ACCEPTED',
          'IN_PROGRESS',
          'COMPLETED',
          'CANCELLED',
        ]),
      })
      .parse(req.body);

    const job = await prisma.job.findFirst({
      where: {
        id: String(req.params.jobId),
        OR: [
          { customerId: req.auth!.userId },
          { professionalId: req.auth!.userId },
        ],
      },
    });

    if (!job) {
      res.status(404).json({
        message: 'ไม่พบงานหรือไม่มีสิทธิ์จัดการงานนี้',
      });
      return;
    }

    const customerStatuses = ['OPEN', 'CANCELLED', 'COMPLETED'];
    const professionalStatuses = ['IN_PROGRESS', 'COMPLETED'];
    const allowedStatuses =
      req.auth!.role === 'CUSTOMER'
        ? customerStatuses
        : professionalStatuses;

    if (!allowedStatuses.includes(input.status)) {
      res.status(403).json({
        message: 'บทบาทนี้ไม่สามารถเปลี่ยนเป็นสถานะดังกล่าว',
      });
      return;
    }

    const updatedJob = await prisma.job.update({
      where: {
        id: job.id,
      },
      data: {
        status: input.status,
      },
      include: {
        room: true,
        payment: true,
      },
    });

    res.json(updatedJob);
  }),
);

/* -------------------------------------------------------------------------- */
/* Chat                                                                        */
/* -------------------------------------------------------------------------- */

app.get(
  '/api/chat/rooms/:roomId/messages',
  auth,
  asyncRoute(async (req, res) => {
    const room = await prisma.chatRoom.findFirst({
      where: {
        id: req.params.roomId,

        job: {
          OR: [
            {
              customerId: req.auth!.userId,
            },
            {
              professionalId: req.auth!.userId,
            },
          ],
        },
      },
    });

    if (!room) {
      res.status(404).json({
        message: 'ไม่พบห้องสนทนา',
      });
      return;
    }

    const messages = await prisma.message.findMany({
      where: {
        roomId: room.id,
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: 200,
    });

    res.json(messages);
  }),
);

app.get(
  '/api/chat/rooms',
  auth,
  asyncRoute(async (req, res) => {
    const rooms = await prisma.chatRoom.findMany({
      where: {
        job: {
          OR: [
            { customerId: req.auth!.userId },
            { professionalId: req.auth!.userId },
          ],
        },
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            status: true,
            customer: { select: { id: true, displayName: true } },
            professional: { select: { id: true, displayName: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, displayName: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rooms);
  }),
);

app.post(
  '/api/chat/rooms/:roomId/messages',
  auth,
  upload.single('image'),
  asyncRoute(async (req, res) => {
    const input = z
      .object({
        body: z.string().trim().max(2000).default(''),
      })
      .parse(req.body);
    if (!input.body && !req.file) {
      res.status(400).json({ message: 'กรุณาพิมพ์ข้อความหรือแนบรูปภาพ' });
      return;
    }

    const room = await prisma.chatRoom.findFirst({
      where: {
        id: req.params.roomId,

        job: {
          OR: [
            {
              customerId: req.auth!.userId,
            },
            {
              professionalId: req.auth!.userId,
            },
          ],
        },
      },
    });

    if (!room) {
      res.status(404).json({
        message: 'ไม่พบห้องสนทนา',
      });
      return;
    }

    let attachmentUrl: string | null = null;
    if (req.file) {
      if (!r2) {
        res.status(503).json({ message: 'ยังไม่ได้ตั้งค่าที่เก็บรูปภาพ' });
        return;
      }
      const key = `chat/${room.id}/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await r2.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET!,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));
      attachmentUrl = `${process.env.R2_PUBLIC_BASE_URL!.replace(/\/$/, '')}/${key}`;
    }

    const message = await prisma.message.create({
      data: {
        roomId: room.id,
        senderId: req.auth!.userId,
        body: input.body,
        attachmentUrl,
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
    });

    io.to(room.id).emit('message:new', message);

    res.status(201).json(message);
  }),
);

/* -------------------------------------------------------------------------- */
/* Payments                                                                    */
/* -------------------------------------------------------------------------- */

const paymentInput = z.object({
  jobId: z.string(),

  method: z.enum([
    'card',
    'promptpay',
    'mobile_banking_scb',
    'mobile_banking_bay',
    'mobile_banking_bbl',
    'mobile_banking_ktb',
  ]),

  /*
   * token ใช้สำหรับบัตรเท่านั้น
   * ห้ามส่งหมายเลขบัตรเข้า API โดยตรง
   */
  token: z.string().optional(),
});

app.get(
  '/api/payments/:jobId',
  auth,
  asyncRoute(async (req, res) => {
    const job = await prisma.job.findFirst({
      where: {
        id: String(req.params.jobId),
        customerId: req.auth!.userId,
      },
      include: {
        payment: true,
      },
    });

    if (!job) {
      res.status(404).json({ message: 'ไม่พบงานหรือไม่มีสิทธิ์ดูรายการชำระเงิน' });
      return;
    }

    if (!job.payment) {
      res.status(404).json({ message: 'ยังไม่มีรายการชำระเงิน' });
      return;
    }

    res.json(job.payment);
  }),
);

app.post(
  '/api/payments/checkout',
  auth,
  asyncRoute(async (req, res) => {
    const input = paymentInput.parse(req.body);

    const job = await prisma.job.findFirst({
      where: {
        id: input.jobId,
        customerId: req.auth!.userId,
      },
      include: {
        payment: true,
      },
    });

    if (!job || job.amount < 2000) {
      res.status(400).json({
        message: 'งานหรือยอดชำระไม่ถูกต้อง',
      });
      return;
    }

    if (
      job.payment?.status === 'PAID' ||
      job.payment?.status === 'RELEASED'
    ) {
      res.status(409).json({
        message: 'รายการนี้ชำระแล้ว',
      });
      return;
    }

    const feePercent = Number(
      process.env.PLATFORM_FEE_PERCENT ?? 10,
    );

    if (
      !Number.isFinite(feePercent) ||
      feePercent < 0 ||
      feePercent > 100
    ) {
      throw new Error(
        'PLATFORM_FEE_PERCENT is invalid',
      );
    }

    const platformFee = Math.round(
      (job.amount * feePercent) / 100,
    );

    let sourceId: string;

    if (input.method === 'card') {
      if (!input.token) {
        res.status(400).json({
          message:
            'ต้องส่ง card token ที่สร้างจากฝั่งผู้ให้บริการ',
        });
        return;
      }

      sourceId = input.token;
    } else {
      const source = await omise.sources.create({
        amount: job.amount,
        currency: 'thb',
        type: input.method,
      });

      sourceId = source.id;
    }

    const charge = await omise.charges.create({
      amount: job.amount,
      currency: 'thb',
      source: sourceId,

      return_uri:
        `${appUrl}/payments/result?job=${job.id}`,

      metadata: {
        jobId: job.id,
        customerId: req.auth!.userId,
      },
    });

    const payment = await prisma.payment.upsert({
      where: {
        jobId: job.id,
      },
      create: {
        jobId: job.id,
        amount: job.amount,
        platformFee,
        professionalNet:
          job.amount - platformFee,
        method: input.method,
        status: charge.paid
          ? 'PAID'
          : 'AWAITING_ACTION',
        providerChargeId: charge.id,
        authorizeUri:
          charge.authorize_uri ?? null,
        paidAt: charge.paid
          ? new Date()
          : null,
      },
      update: {
        amount: job.amount,
        platformFee,
        professionalNet:
          job.amount - platformFee,
        method: input.method,
        status: charge.paid
          ? 'PAID'
          : 'AWAITING_ACTION',
        providerChargeId: charge.id,
        authorizeUri:
          charge.authorize_uri ?? null,
        paidAt: charge.paid
          ? new Date()
          : null,
      },
    });

    res.json({
      payment,
      authorizeUri:
        charge.authorize_uri ?? null,
      source: charge.source ?? null,
    });
  }),
);

app.post(
  '/api/payments/webhook',
  asyncRoute(async (req, res) => {
    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({
        message: 'Webhook body must be raw',
      });
      return;
    }

    const event = JSON.parse(
      req.body.toString('utf8'),
    );

    if (!event.id || !event.key) {
      res.status(400).end();
      return;
    }

    const processedEvent =
      await prisma.webhookEvent.findUnique({
        where: {
          id: event.id,
        },
      });

    if (processedEvent) {
      res.status(200).end();
      return;
    }

    if (
      event.key === 'charge.complete' &&
      event.data?.id
    ) {
      /*
       * ดึงข้อมูล Charge จาก Opn อีกครั้ง
       * ไม่เชื่อค่าจาก webhook โดยตรง
       */
      const charge = await omise.charges.retrieve(
        event.data.id,
      );

      await prisma.$transaction([
        prisma.payment.updateMany({
          where: {
            providerChargeId: charge.id,
          },
          data: {
            status: charge.paid
              ? 'PAID'
              : 'FAILED',

            paidAt: charge.paid
              ? new Date()
              : null,
          },
        }),

        prisma.webhookEvent.create({
          data: {
            id: event.id,
            eventType: event.key,
          },
        }),
      ]);
    } else {
      await prisma.webhookEvent.create({
        data: {
          id: event.id,
          eventType: event.key,
        },
      });
    }

    res.status(200).end();
  }),
);

app.post(
  '/api/jobs/:jobId/release-payment',
  auth,
  asyncRoute(async (req, res) => {
    const job = await prisma.job.findFirst({
      where: {
        id: req.params.jobId,
        customerId: req.auth!.userId,
      },
      include: {
        payment: true,

        professional: {
          include: {
            professional: true,
          },
        },
      },
    });

    const professionalProfile =
      job?.professional?.professional;

    if (
      !job?.payment ||
      job.payment.status !== 'PAID' ||
      !professionalProfile?.opnRecipientId
    ) {
      res.status(409).json({
        message:
          'ยังปล่อยเงินไม่ได้ กรุณาตรวจสอบการชำระและ KYC ของช่าง',
      });
      return;
    }

    const recipient =
      await omise.recipients.retrieve(
        professionalProfile.opnRecipientId,
      );

    if (!recipient.verified) {
      res.status(409).json({
        message:
          'บัญชีรับเงินของช่างยังไม่ผ่านการตรวจสอบ',
      });
      return;
    }

    const transfer = await omise.transfers.create({
      amount: job.payment.professionalNet,
      recipient: recipient.id,

      metadata: {
        jobId: job.id,
      },
    });

    const payment = await prisma.payment.update({
      where: {
        id: job.payment.id,
      },
      data: {
        status: 'RELEASED',
        payoutStatus: 'PROCESSING',
        providerTransferId: transfer.id,
        releasedAt: new Date(),
      },
    });

    await prisma.job.update({
      where: {
        id: job.id,
      },
      data: {
        status: 'COMPLETED',
      },
    });

    res.json(payment);
  }),
);

/* -------------------------------------------------------------------------- */
/* Socket.IO                                                                   */
/* -------------------------------------------------------------------------- */

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      next(new Error('unauthorized'));
      return;
    }

    const payload = jwt.verify(
      token,
      jwtSecret,
      {
        issuer: 'ninechang',
      },
    ) as AuthTokenPayload;

    socket.data.userId = String(payload.sub);
    socket.data.role = payload.role;

    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  void socket.join(socket.data.userId);

  socket.on(
    'room:join',
    async (
      roomId: string,
      done?: (value: unknown) => void,
    ) => {
      try {
        const room =
          await prisma.chatRoom.findFirst({
            where: {
              id: roomId,

              job: {
                OR: [
                  {
                    customerId:
                      socket.data.userId,
                  },
                  {
                    professionalId:
                      socket.data.userId,
                  },
                ],
              },
            },
          });

        if (!room) {
          done?.({
            error: 'forbidden',
          });
          return;
        }

        await socket.join(roomId);

        done?.({
          ok: true,
        });
      } catch {
        done?.({
          error: 'join_failed',
        });
      }
    },
  );

  socket.on(
    'message:send',
    async (
      payload: {
        roomId: string;
        body: string;
      },
      done?: (value: unknown) => void,
    ) => {
      try {
        const body = payload.body?.trim();

        if (
          !body ||
          body.length > 2000 ||
          !socket.rooms.has(payload.roomId)
        ) {
          done?.({
            error: 'invalid_message',
          });
          return;
        }

        const message =
          await prisma.message.create({
            data: {
              roomId: payload.roomId,
              senderId:
                socket.data.userId,
              body,
            },
            include: {
              sender: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          });

        io.to(payload.roomId).emit(
          'message:new',
          message,
        );

        done?.({
          ok: true,
          message,
        });
      } catch {
        done?.({
          error: 'send_failed',
        });
      }
    },
  );
});

/* -------------------------------------------------------------------------- */
/* Error handler                                                               */
/* -------------------------------------------------------------------------- */

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (error instanceof z.ZodError) {
      res.status(422).json({
        message: 'ข้อมูลไม่ถูกต้อง',
        errors: error.flatten(),
      });
      return;
    }

    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res.status(409).json({
        message: 'ข้อมูลนี้ถูกใช้งานแล้ว',
      });
      return;
    }

    console.error(error);

    res.status(500).json({
      message: 'ระบบขัดข้อง กรุณาลองใหม่',
    });
  },
);

/* -------------------------------------------------------------------------- */
/* Start and shutdown                                                          */
/* -------------------------------------------------------------------------- */

server.listen(port, '0.0.0.0', () => {
  console.log(
    `NineChang API ready at http://localhost:${port}`,
  );
});

async function shutdown() {
  console.log('Shutting down NineChang API...');

  io.close();
  server.close();

  await prisma.$disconnect();

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);