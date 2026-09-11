# NineChang API

Backend กลางสำหรับเว็บและ Flutter: MySQL/Prisma, JWT, งาน, Socket.IO chat และ Opn Payments

## ติดตั้ง

```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev
```

ยอดเงินเก็บเป็นหน่วยสตางค์ เช่น 150000 = 1,500 บาท ห้ามรับเลขบัตรเข้า API นี้โดยตรง ฝั่งเว็บ/แอปต้องสร้าง token ด้วย SDK ของผู้ให้บริการ แล้วส่งเฉพาะ token มาที่ `/api/payments/checkout`

Webhook production ต้องใช้ HTTPS และตั้ง endpoint เป็น `/api/payments/webhook` ใน Opn Dashboard ก่อนเปิดเงินจริง
