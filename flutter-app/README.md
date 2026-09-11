# NineChang Flutter

แอปต้นแบบ Marketplace สำหรับค้นหาและจ้างช่าง สร้างด้วย Flutter และ Material 3

## เริ่มใช้งาน

โปรเจกต์นี้ให้ source code ส่วนแอปโดยไม่รวมไฟล์ native ที่ Flutter สร้างอัตโนมัติ ให้ติดตั้ง Flutter SDK แล้วรัน:

```bash
flutter create . --org com.theninedesign --project-name ninechang_app --platforms=android,ios,web
flutter pub get
flutter run
```

กำหนด API สำหรับเครื่องจริงด้วย:

```bash
flutter run --dart-define=API_URL=https://api.your-domain.com
```

ระบบล็อกอินอยู่ที่ `lib/auth_page.dart`, แชตที่ `lib/chat_page.dart`, การชำระเงินที่ `lib/payment_page.dart` และตัวเชื่อม API ที่ `lib/api_client.dart`

Flutter จะใช้ API ชุดเดียวกับเว็บ NineChang เพื่อให้บัญชี ลูกค้า ช่าง ผู้รับเหมา งาน บริการ แชต รีวิว และการชำระเงินทำงานร่วมกันได้ โดยเพิ่มกล้องและตำแหน่งงานในเฟสถัดไป
