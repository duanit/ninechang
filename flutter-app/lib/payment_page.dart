import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api_client.dart';

class PaymentPage extends StatefulWidget {
  const PaymentPage({super.key, required this.jobId, required this.amountSatang});
  final String jobId;
  final int amountSatang;
  @override State<PaymentPage> createState() => _PaymentPageState();
}

class _PaymentPageState extends State<PaymentPage> {
  String method = 'promptpay';
  bool loading = false;
  Future<void> pay() async {
    setState(() => loading = true);
    try {
      final result = await ApiClient.instance.post('/api/payments/checkout', {'jobId': widget.jobId, 'method': method});
      final uri = result['authorizeUri'];
      if (uri != null) await launchUrl(Uri.parse(uri), mode: LaunchMode.externalApplication);
    } catch (e) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()))); }
    finally { if (mounted) setState(() => loading = false); }
  }
  @override Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('ชำระเงิน')), body: ListView(padding: const EdgeInsets.all(18), children: [
    Text('ยอดชำระ ฿${(widget.amountSatang / 100).toStringAsFixed(2)}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
    const SizedBox(height: 20),
    for (final item in const [('promptpay', 'PromptPay QR'), ('mobile_banking_scb', 'SCB EASY'), ('mobile_banking_bay', 'Krungsri Mobile'), ('mobile_banking_bbl', 'Bangkok Bank Mobile'), ('mobile_banking_ktb', 'Krungthai NEXT')])
      RadioListTile(value: item.$1, groupValue: method, onChanged: (v) => setState(() => method = v!), title: Text(item.$2)),
    const SizedBox(height: 16),
    FilledButton(onPressed: loading ? null : pay, child: Padding(padding: const EdgeInsets.all(14), child: Text(loading ? 'กำลังสร้างรายการ...' : 'ดำเนินการชำระเงิน'))),
    const Padding(padding: EdgeInsets.only(top: 12), child: Text('บัตรเครดิตต้องสร้าง token ผ่าน Opn SDK ก่อน จึงไม่รับเลขบัตรผ่าน NineChang API โดยตรง', style: TextStyle(color: Colors.black54))),
  ]));
}
