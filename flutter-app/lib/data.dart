class ServiceCategory {
  const ServiceCategory(this.icon, this.name, this.description);
  final String icon;
  final String name;
  final String description;
}

class Professional {
  const Professional({
    required this.name,
    required this.job,
    required this.rating,
    required this.reviews,
    required this.price,
    required this.emoji,
    required this.verified,
  });
  final String name;
  final String job;
  final double rating;
  final int reviews;
  final int price;
  final String emoji;
  final bool verified;
}

const categories = <ServiceCategory>[
  ServiceCategory('🔧', 'ซ่อมแซม', 'งานซ่อมทั่วไป'),
  ServiceCategory('⚡', 'ไฟฟ้า', 'ติดตั้งและแก้ระบบไฟ'),
  ServiceCategory('🚿', 'ประปา', 'ท่อรั่วและสุขภัณฑ์'),
  ServiceCategory('❄️', 'แอร์', 'ล้าง ซ่อม ติดตั้ง'),
  ServiceCategory('🎨', 'ทาสี', 'ภายในและภายนอก'),
  ServiceCategory('🏠', 'ออกแบบบ้าน', 'ออกแบบบ้านและแบบก่อสร้าง'),
  ServiceCategory('🛋️', 'ออกแบบตกแต่งภายใน', 'วางแผนพื้นที่และตกแต่ง'),
  ServiceCategory('🧹', 'ทำความสะอาด', 'บ้านและสำนักงาน'),
];

const professionals = <Professional>[
  Professional(name: 'ช่างนัท เซอร์วิส', job: 'ช่างไฟฟ้าและระบบภายใน', rating: 4.9, reviews: 128, price: 650, emoji: '👨🏻‍🔧', verified: true),
  Professional(name: 'ทีมแอร์บ้านเย็น', job: 'ล้างและซ่อมเครื่องปรับอากาศ', rating: 4.8, reviews: 94, price: 500, emoji: '🧑🏻‍🔧', verified: true),
  Professional(name: 'Nine Paint Studio', job: 'ทาสีและตกแต่งภายใน', rating: 4.7, reviews: 76, price: 1200, emoji: '👷🏻', verified: false),
];
