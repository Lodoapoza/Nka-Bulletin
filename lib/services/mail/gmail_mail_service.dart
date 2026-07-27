import 'dart:convert';
import 'package:dio/dio.dart';
import 'mail_service.dart';

class GmailMailService implements MailService {
  final String accessToken;
  final Dio _dio = Dio();

  GmailMailService({required this.accessToken});

  @override
  Future<List<MailMessage>> fetchBulletinMessages() async {
    final query = 'subject:(bulletin OR bulletin) has:attachment filename:pdf';
    final response = await _dio.get(
      'https://www.googleapis.com/gmail/v1/users/me/messages',
      queryParameters: {
        'q': query,
        'maxResults': 20,
      },
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );

    final List<MailMessage> messages = [];
    final messageIds = response.data['messages'] as List? ?? [];

    for (final msg in messageIds) {
      final detail = await _dio.get(
        'https://www.googleapis.com/gmail/v1/users/me/messages/${msg["id"]}',
        options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
      );

      final payload = detail.data['payload'];
      final headers = (payload['headers'] as List)
          .where((h) => h['name'] == 'From' || h['name'] == 'Subject' || h['name'] == 'Date')
          .toList();

      String fromName = '';
      String fromEmail = '';
      String subject = '';
      String dateStr = '';

      for (final h in headers) {
        if (h['name'] == 'From') {
          fromName = h['value'].toString();
          fromEmail = h['value'].toString();
        } else if (h['name'] == 'Subject') {
          subject = h['value'].toString();
        } else if (h['name'] == 'Date') {
          dateStr = h['value'].toString();
        }
      }

      messages.add(MailMessage(
        messageId: msg['id'],
        subject: subject,
        fromName: fromName,
        fromEmail: fromEmail,
        date: DateTime.tryParse(dateStr) ?? DateTime.now(),
        hasAttachments: payload['parts'] != null,
        snippet: detail.data['snippet'],
      ));
    }

    return messages;
  }

  @override
  Future<List<MailAttachment>> downloadAttachments(MailMessage message) async {
    final response = await _dio.get(
      'https://www.googleapis.com/gmail/v1/users/me/messages/${message.messageId}',
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    );

    final List<MailAttachment> attachments = [];
    final parts = response.data['payload']['parts'] as List? ?? [];

    for (final part in parts) {
      if (part['filename'] != null && part['filename'].toString().isNotEmpty) {
        if (part['body']?['attachmentId'] != null) {
          final attResponse = await _dio.get(
            'https://www.googleapis.com/gmail/v1/users/me/messages/${message.messageId}/attachments/${part['body']['attachmentId']}',
            options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
          );

          final data = attResponse.data['data'] as String? ?? '';
          final bytes = base64Decode(data.replaceAll('-', '+').replaceAll('_', '/'));

          attachments.add(MailAttachment(
            fileName: part['filename'],
            filePath: '/tmp/${part['filename']}',
            bytes: bytes,
            size: bytes.length,
            mimeType: part['mimeType'] ?? 'application/octet-stream',
          ));
        }
      }
    }

    return attachments;
  }
}