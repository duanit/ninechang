import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'api_client.dart';

class ChatPage extends StatefulWidget {
  const ChatPage({super.key, required this.roomId});
  final String roomId;
  @override State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final input = TextEditingController();
  final messages = <Map<String, dynamic>>[];
  io.Socket? socket;
  @override void initState() { super.initState(); connect(); }
  Future<void> connect() async {
    final history = await ApiClient.instance.getList('/api/chat/rooms/${widget.roomId}/messages');
    if (mounted) setState(() => messages.addAll(history.cast<Map<String, dynamic>>()));
    socket = io.io(ApiClient.baseUrl, io.OptionBuilder().setTransports(['websocket']).setAuth({'token': await ApiClient.instance.token}).disableAutoConnect().build());
    socket!.onConnect((_) => socket!.emit('room:join', widget.roomId));
    socket!.on('message:new', (value) { if (mounted) setState(() => messages.add(Map<String, dynamic>.from(value))); });
    socket!.connect();
  }
  void send() { final body = input.text.trim(); if (body.isEmpty) return; socket?.emit('message:send', {'roomId': widget.roomId, 'body': body}); input.clear(); }
  @override void dispose() { socket?.dispose(); input.dispose(); super.dispose(); }
  @override Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: const Text('แชตเรื่องงาน')), body: Column(children: [
    Expanded(child: ListView.builder(padding: const EdgeInsets.all(12), itemCount: messages.length, itemBuilder: (_, i) => Card(child: ListTile(title: Text(messages[i]['sender']?['displayName'] ?? 'ผู้ใช้งาน'), subtitle: Text(messages[i]['body'] ?? ''))))),
    SafeArea(top: false, child: Padding(padding: const EdgeInsets.all(12), child: Row(children: [Expanded(child: TextField(controller: input, decoration: const InputDecoration(hintText: 'พิมพ์ข้อความ'))), IconButton.filled(onPressed: send, icon: const Icon(Icons.send))]))),
  ]));
}
