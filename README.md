# NineChang Full-stack MVP

แพลตฟอร์ม Marketplace งานช่าง ประกอบด้วย:

- `web-pwa` — Next.js/TypeScript รองรับ PWA, สมัครสมาชิก, เข้าสู่ระบบ, งาน, แชต และชำระเงิน
- `flutter-app` — Flutter/Dart ใช้บัญชีและ API ชุดเดียวกับเว็บ
- `backend-api` — Node.js/Express/Prisma/MySQL, JWT, Socket.IO และ Opn Payments

## ลำดับการเปิดระบบ

1. สร้าง MySQL database แล้วคัดลอก `backend-api/.env.example` เป็น `.env`
2. ใส่ `DATABASE_URL`, `JWT_SECRET` และ Opn test keys
3. ใน `backend-api`: `npm install`, `npx prisma migrate dev --name init`, `npm run dev`
4. ใน `web-pwa`: สร้าง `.env.local` และใส่ `NEXT_PUBLIC_API_URL=http://localhost:4000` จากนั้น `npm install`, `npm run dev`
5. ใน `flutter-app`: รัน `flutter create .` และ `flutter run --dart-define=API_URL=http://10.0.2.2:4000`

## ก่อนเปิดเงินจริง

- เปลี่ยนจาก test keys เป็น live keys หลังบัญชีร้านค้าผ่านอนุมัติ
- ตั้ง HTTPS, webhook และ CORS ให้เป็นโดเมนจริง
- ทดสอบ success, failed, duplicate webhook, refund, dispute และ payout failure
- ให้ช่างลงทะเบียนบัญชีรับเงินและผ่าน recipient verification/KYC
- ตรวจสัญญา เงื่อนไขคืนเงิน ภาษี และรูปแบบการถือเงินกับผู้ให้บริการ/ที่ปรึกษากฎหมาย

หมายเหตุ: เงินในฐานข้อมูลใช้หน่วยสตางค์เสมอ ระบบไม่บันทึกเลขบัตร และถือผล webhook/provider API เป็นหลักฐานการชำระ
