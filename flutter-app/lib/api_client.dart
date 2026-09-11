import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiClient {
  ApiClient._();
  static final instance = ApiClient._();
  static const baseUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');
  final storage = const FlutterSecureStorage();

  Future<String?> get token => storage.read(key: 'access_token');
  Future<Map<String, String>> headers() async => {'Content-Type': 'application/json', if (await token case final String value) 'Authorization': 'Bearer $value'};

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final response = await http.post(Uri.parse('$baseUrl$path'), headers: await headers(), body: jsonEncode(body));
    return _decode(response);
  }

  Future<List<dynamic>> getList(String path) async {
    final response = await http.get(Uri.parse('$baseUrl$path'), headers: await headers());
    final value = _decode(response);
    return value as List<dynamic>;
  }

  Future<Map<String, dynamic>> getObject(String path) async {
    final response = await http.get(Uri.parse('$baseUrl$path'), headers: await headers());
    return _decode(response) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> patch(String path, Map<String, dynamic> body) async {
    final response = await http.patch(Uri.parse('$baseUrl$path'), headers: await headers(), body: jsonEncode(body));
    return _decode(response) as Map<String, dynamic>;
  }

  dynamic _decode(http.Response response) {
    final value = response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(value is Map ? value['message']?.toString() ?? 'เกิดข้อผิดพลาด' : 'เกิดข้อผิดพลาด');
    }
    return value;
  }

  Future<void> saveToken(String value) => storage.write(key: 'access_token', value: value);
  Future<void> logout() => storage.delete(key: 'access_token');
}

class ApiException implements Exception {
  const ApiException(this.message);
  final String message;
  @override String toString() => message;
}
