import 'package:flutter/material.dart';
import 'api_client.dart';
import 'main.dart' show MainShell;
import 'theme.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});
  @override State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool loading = true;
  bool signedIn = false;
  @override void initState() { super.initState(); _restore(); }
  Future<void> _restore() async { signedIn = await ApiClient.instance.token != null; if (mounted) setState(() => loading = false); }
  @override Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return signedIn ? const MainShell() : LoginPage(onSuccess: () => setState(() => signedIn = true));
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.onSuccess});
  final VoidCallback onSuccess;
  @override State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  final name = TextEditingController();
  bool register = false, loading = false;
  String role = 'CUSTOMER';
  String? error;

  Future<void> submit() async {
    setState(() { loading = true; error = null; });
    try {
      final result = await ApiClient.instance.post(register ? '/api/auth/register' : '/api/auth/login', {
        'email': email.text.trim(), 'password': password.text,
        if (register) 'displayName': name.text.trim(),
        if (register) 'role': role,
      });
      await ApiClient.instance.saveToken(result['token']);
      widget.onSuccess();
    } catch (e) { if (mounted) setState(() => error = e.toString()); }
    finally { if (mounted) setState(() => loading = false); }
  }

  @override Widget build(BuildContext context) => Scaffold(
    body: SafeArea(child: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 430), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Icon(Icons.handyman_rounded, size: 64, color: orange),
      const SizedBox(height: 14),
      const Text('NineChang', textAlign: TextAlign.center, style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: navy)),
      const SizedBox(height: 30),
      if (register) ...[TextField(controller: name, decoration: const InputDecoration(labelText: 'ชื่อที่แสดง')), const SizedBox(height: 12)],
      TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'อีเมล')), const SizedBox(height: 12),
      TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'รหัสผ่านอย่างน้อย 8 ตัว')), const SizedBox(height: 12),
      if (register) ...[
        const Text('ประเภทบัญชี', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'CUSTOMER', label: Text('ลูกค้า')),
            ButtonSegment(value: 'PROFESSIONAL', label: Text('ช่าง')),
            ButtonSegment(value: 'CONTRACTOR', label: Text('ผู้รับเหมา')),
          ],
          selected: {role},
          onSelectionChanged: (values) => setState(() => role = values.first),
        ),
        const SizedBox(height: 12),
      ],
      if (error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(error!, style: const TextStyle(color: Colors.red))),
      FilledButton(onPressed: loading ? null : submit, child: Padding(padding: const EdgeInsets.all(14), child: Text(loading ? 'กำลังดำเนินการ...' : register ? 'สร้างบัญชี' : 'เข้าสู่ระบบ'))),
      TextButton(onPressed: () => setState(() => register = !register), child: Text(register ? 'มีบัญชีแล้ว เข้าสู่ระบบ' : 'ยังไม่มีบัญชี สมัครสมาชิก')),
      ]))))),
  );
}
