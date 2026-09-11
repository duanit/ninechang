import 'package:flutter/material.dart';
import 'data.dart';
import 'auth_page.dart';
import 'api_client.dart';
import 'theme.dart';

void main() => runApp(const NineChangApp());

class NineChangApp extends StatelessWidget {
  const NineChangApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'NineChang',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: orange, primary: orange, secondary: navy),
        scaffoldBackgroundColor: canvas,
        appBarTheme: const AppBarTheme(backgroundColor: Colors.white, foregroundColor: navy, surfaceTintColor: Colors.transparent),
        navigationBarTheme: const NavigationBarThemeData(backgroundColor: Colors.white, indicatorColor: Color(0xFFFFE3D8)),
        cardTheme: const CardThemeData(color: Colors.white, elevation: 0, margin: EdgeInsets.zero),
        inputDecorationTheme: InputDecorationTheme(filled: true, fillColor: Colors.white, border: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: BorderSide.none)),
      ),
      home: const AuthGate(),
    );
  }
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});
  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int index = 0;
  final saved = <String>{};

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomePage(saved: saved, onSave: (name) => setState(() => saved.contains(name) ? saved.remove(name) : saved.add(name))),
      const JobsPage(),
      const SimplePage(icon: Icons.chat_bubble_outline, title: 'ข้อความ', subtitle: 'พูดคุยกับช่างและลูกค้าอย่างเป็นระบบ'),
      SavedPage(saved: saved),
      const SimplePage(icon: Icons.person_outline, title: 'บัญชี', subtitle: 'จัดการข้อมูลส่วนตัว ที่อยู่ และการชำระเงิน'),
    ];
    return Scaffold(
      body: SafeArea(child: IndexedStack(index: index, children: pages)),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'หน้าแรก'),
          NavigationDestination(icon: Icon(Icons.assignment_outlined), label: 'งาน'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: 'ข้อความ'),
          NavigationDestination(icon: Icon(Icons.favorite_border), selectedIcon: Icon(Icons.favorite), label: 'บันทึก'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'บัญชี'),
        ],
      ),
    );
  }
}

class JobsPage extends StatefulWidget {
  const JobsPage({super.key});
  @override
  State<JobsPage> createState() => _JobsPageState();
}

class _JobsPageState extends State<JobsPage> {
  bool loading = true;
  String? error;
  List<Map<String, dynamic>> jobs = [];
  bool provider = false;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    try {
      final me = await ApiClient.instance.getObject('/api/me');
      final role = me['role']?.toString();
      provider = role == 'PROFESSIONAL' || role == 'CONTRACTOR';
      final result = await ApiClient.instance.getList(provider ? '/api/jobs' : '/api/jobs');
      if (!mounted) return;
      setState(() {
        jobs = result.cast<Map<String, dynamic>>();
        loading = false;
      });
    } catch (e) {
      if (mounted) setState(() { error = e.toString(); loading = false; });
    }
  }

  Future<void> claim(String id) async {
    try {
      await ApiClient.instance.post('/api/jobs/$id/claim', {});
      await load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> createJob() async {
    final title = TextEditingController();
    final description = TextEditingController();
    final amount = TextEditingController();
    var category = 'ออกแบบบ้าน';
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(builder: (context, setDialogState) => AlertDialog(
        title: const Text('สร้างงานใหม่'),
        content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: title, decoration: const InputDecoration(labelText: 'ชื่องาน')),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            value: category,
            decoration: const InputDecoration(labelText: 'หมวดงาน'),
            items: const ['ออกแบบบ้าน', 'ออกแบบตกแต่งภายใน', 'ซ่อมแซมทั่วไป', 'ระบบไฟฟ้า', 'ประปา'].map((item) => DropdownMenuItem(value: item, child: Text(item))).toList(),
            onChanged: (value) => setDialogState(() => category = value ?? category),
          ),
          const SizedBox(height: 10),
          TextField(controller: description, maxLines: 3, decoration: const InputDecoration(labelText: 'รายละเอียด')),
          const SizedBox(height: 10),
          TextField(controller: amount, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'งบประมาณ (บาท)')),
        ])),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('ยกเลิก')),
          FilledButton(onPressed: () async {
            await ApiClient.instance.post('/api/jobs', {'title': title.text.trim(), 'category': category, 'description': description.text.trim(), 'amount': (double.tryParse(amount.text) ?? 0) * 100});
            if (context.mounted) Navigator.pop(context, true);
          }, child: const Text('สร้างงาน')),
        ],
      )),
    );
    title.dispose();
    description.dispose();
    amount.dispose();
    if (result == true) await load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(provider ? 'งานที่เปิดรับ' : 'งานของฉัน'), actions: [
        if (!provider) IconButton(onPressed: createJob, icon: const Icon(Icons.add_task), tooltip: 'สร้างงาน'),
        IconButton(onPressed: load, icon: const Icon(Icons.refresh)),
      ]),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(child: Text(error!))
              : jobs.isEmpty
                  ? const Center(child: Text('ยังไม่มีงาน'))
                  : RefreshIndicator(onRefresh: load, child: ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: jobs.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, index) {
                        final job = jobs[index];
                        final amount = (job['amount'] as num? ?? 0) / 100;
                        final status = job['status']?.toString() ?? 'OPEN';
                        return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Wrap(spacing: 8, children: [
                            Chip(label: Text(status)),
                            if (job['category'] != null) Chip(label: Text(job['category'].toString())),
                          ]),
                          Text(job['title']?.toString() ?? 'งานไม่ระบุชื่อ', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          Text(job['description']?.toString() ?? '', maxLines: 3, overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 8),
                          Text('฿${amount.toStringAsFixed(0)}', style: const TextStyle(color: orange, fontWeight: FontWeight.w800)),
                          if (provider && status == 'OPEN') Align(alignment: Alignment.centerRight, child: FilledButton(onPressed: () => claim(job['id'].toString()), child: const Text('รับงาน'))),
                        ])));
                      },
                    )),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.saved, required this.onSave});
  final Set<String> saved;
  final ValueChanged<String> onSave;
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  bool customerMode = true;
  String query = '';

  @override
  Widget build(BuildContext context) {
    final filtered = professionals.where((p) => '${p.name} ${p.job}'.toLowerCase().contains(query.toLowerCase())).toList();
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          pinned: true,
          title: const Row(children: [Logo(), SizedBox(width: 10), Text('NineChang', style: TextStyle(fontWeight: FontWeight.w800))]),
          actions: [IconButton(onPressed: () {}, icon: const Badge(child: Icon(Icons.notifications_none)))],
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
          sliver: SliverList.list(children: [
            _Hero(customerMode: customerMode, onModeChanged: (value) => setState(() => customerMode = value), onSearch: (value) => setState(() => query = value)),
            const SizedBox(height: 26),
            const SectionTitle(title: 'บริการยอดนิยม', action: 'ดูทั้งหมด'),
            const SizedBox(height: 14),
            SizedBox(height: 126, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: categories.length, separatorBuilder: (_, __) => const SizedBox(width: 10), itemBuilder: (_, i) => CategoryCard(category: categories[i]))),
            const SizedBox(height: 26),
            const SectionTitle(title: 'มืออาชีพแนะนำ', action: 'ดูทั้งหมด'),
            const SizedBox(height: 14),
            if (filtered.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('ไม่พบมืออาชีพที่ค้นหา'))),
            ...filtered.map((pro) => Padding(padding: const EdgeInsets.only(bottom: 12), child: ProCard(pro: pro, saved: widget.saved.contains(pro.name), onSave: () => widget.onSave(pro.name)))),
          ]),
        ),
      ],
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.customerMode, required this.onModeChanged, required this.onSearch});
  final bool customerMode;
  final ValueChanged<bool> onModeChanged;
  final ValueChanged<String> onSearch;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(color: navy, borderRadius: BorderRadius.circular(28)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: ChoiceChip(label: const Text('ฉันต้องการจ้าง'), selected: customerMode, onSelected: (_) => onModeChanged(true))),
          const SizedBox(width: 8),
          Expanded(child: ChoiceChip(label: const Text('ฉันเป็นช่าง'), selected: !customerMode, onSelected: (_) => onModeChanged(false))),
        ]),
        const SizedBox(height: 22),
        Text(customerMode ? 'งานบ้านทุกเรื่อง\nจบได้ในที่เดียว' : 'เปลี่ยนฝีมือของคุณ\nให้เป็นรายได้', style: const TextStyle(color: Colors.white, fontSize: 27, height: 1.2, fontWeight: FontWeight.w800)),
        const SizedBox(height: 9),
        Text(customerMode ? 'ค้นหาช่างที่ผ่านการตรวจสอบ พร้อมรีวิวจริง' : 'รับงานใกล้บ้าน เสนอราคา และสร้างโปรไฟล์มืออาชีพ', style: const TextStyle(color: Color(0xFFCED6E3))),
        const SizedBox(height: 18),
        TextField(onChanged: onSearch, decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'ค้นหา เช่น ล้างแอร์ ซ่อมไฟ ทาสี')),
      ]),
    );
  }
}

class CategoryCard extends StatelessWidget {
  const CategoryCard({super.key, required this.category});
  final ServiceCategory category;
  @override
  Widget build(BuildContext context) => Container(
    width: 108,
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20), border: Border.all(color: const Color(0xFFE8EAF0))),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(category.icon, style: const TextStyle(fontSize: 30)), const Spacer(), Text(category.name, style: const TextStyle(fontWeight: FontWeight.w700)), Text(category.description, maxLines: 1, style: const TextStyle(fontSize: 11, color: Colors.black54))]),
  );
}

class ProCard extends StatelessWidget {
  const ProCard({super.key, required this.pro, required this.saved, required this.onSave});
  final Professional pro;
  final bool saved;
  final VoidCallback onSave;
  @override
  Widget build(BuildContext context) => Card(
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: const BorderSide(color: Color(0xFFE8EAF0))),
    child: Padding(padding: const EdgeInsets.all(15), child: Row(children: [
      Container(width: 64, height: 64, alignment: Alignment.center, decoration: BoxDecoration(color: const Color(0xFFFFEEE7), borderRadius: BorderRadius.circular(18)), child: Text(pro.emoji, style: const TextStyle(fontSize: 34))),
      const SizedBox(width: 13),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Flexible(child: Text(pro.name, style: const TextStyle(fontWeight: FontWeight.w800))), if (pro.verified) const Padding(padding: EdgeInsets.only(left: 5), child: Icon(Icons.verified, size: 17, color: Colors.blue))]),
        Text(pro.job, style: const TextStyle(color: Colors.black54)),
        const SizedBox(height: 8),
        Row(children: [const Icon(Icons.star_rounded, size: 18, color: Colors.amber), Text(' ${pro.rating} (${pro.reviews})'), const Spacer(), Text('เริ่ม ฿${pro.price}', style: const TextStyle(color: orange, fontWeight: FontWeight.w800))]),
      ])),
      IconButton(onPressed: onSave, icon: Icon(saved ? Icons.favorite : Icons.favorite_border, color: saved ? orange : null)),
    ])),
  );
}

class SavedPage extends StatelessWidget {
  const SavedPage({super.key, required this.saved});
  final Set<String> saved;
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('รายการที่บันทึก')), body: saved.isEmpty ? const Center(child: Text('ยังไม่มีรายการที่บันทึก')) : ListView(padding: const EdgeInsets.all(18), children: saved.map((name) => ListTile(tileColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)), leading: const Icon(Icons.favorite, color: orange), title: Text(name))).toList()));
}

class SimplePage extends StatelessWidget {
  const SimplePage({super.key, required this.icon, required this.title, required this.subtitle});
  final IconData icon;
  final String title;
  final String subtitle;
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(title)), body: Center(child: Padding(padding: const EdgeInsets.all(28), child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 60, color: orange), const SizedBox(height: 18), Text(title, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)), const SizedBox(height: 8), Text(subtitle, textAlign: TextAlign.center, style: const TextStyle(color: Colors.black54))]))));
}

class SectionTitle extends StatelessWidget {
  const SectionTitle({super.key, required this.title, required this.action});
  final String title;
  final String action;
  @override
  Widget build(BuildContext context) => Row(children: [Expanded(child: Text(title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: navy))), Text(action, style: const TextStyle(color: orange, fontWeight: FontWeight.w700))]);
}

class Logo extends StatelessWidget {
  const Logo({super.key});
  @override
  Widget build(BuildContext context) => Container(width: 35, height: 35, alignment: Alignment.center, decoration: BoxDecoration(color: orange, borderRadius: BorderRadius.circular(11)), child: const Text('N', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20)));
}
