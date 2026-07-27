import 'dart:convert';
import 'package:dio/dio.dart';
import 'mail_service.dart';

class OutlookMailService implements MailService {
  final String accessToken;
  final Dio _dio = Dio();

  OutlookMailService({required this.accessToken});

  @override
  Future<List<MailMessage>> fetchBulletinMessages() async {
    final response = await _dio.get(
      'https://graph.microsoft.com/v1.0/me/messages',
      queryParameters: {
        r'$filter': "hasAttachments eq true and (subject/contains('bulletin'))",
        r'$select': 'id,subject,from,receivedDateTime,hasAttachments,body',
        r'$top': '20',
      },
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );

    final List<MailMessage> messages = [];
    final values = response.data['value'] as List? ?? [];

    for (final msg in values) {
      final from = msg['from']?['emailAddress'] ?? {};
      messages.add(MailMessage(
        messageId: msg['id'],
        subject: msg['subject'] ?? '',
        fromName: from['name'] ?? '',
        fromEmail: from['address'] ?? '',
        date: DateTime.tryParse(msg['receivedDateTime'] ?? '') ?? DateTime.now(),
        hasAttachments: msg['hasAttachments'] ?? false,
        snippet: msg['body']?['content']?.toString().substring(0, 200),
      ));
    }

    return messages;
  }

  @override
  Future<List<MailAttachment>> downloadAttachments(MailMessage message) async {
    final response = await _dio.get(
      'https://graph.microsoft.com/v1.0/me/messages/${message.messageId}/attachments',
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );

    final List<MailAttachment> attachments = [];
    final values = response.data['value'] as List? ?? [];

    for (final att in values) {
      if (att['name']?.toString().toLowerCase().endsWith('.pdf') == true) {
        final content = att['contentBytes'] as String? ?? '';
        final bytes = base64Decode(content);

        attachments.add(MailAttachment(
          fileName: att['name'],
          filePath: '/tmp/${att['name']}',
          bytes: bytes,
          size: bytes.length,
          mimeType: att['contentType'] ?? 'application/pdf',
        ));
      }
    }

    return attachments;
  }
}