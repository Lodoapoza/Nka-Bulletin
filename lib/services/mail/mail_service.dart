abstract class MailAttachment {
  final String fileName;
  final String filePath;
  final List<int> bytes;
  final int size;
  final String mimeType;

  const MailAttachment({
    required this.fileName,
    required this.filePath,
    required this.bytes,
    required this.size,
    required this.mimeType,
  });
}

class MailMessage {
  final String messageId;
  final String subject;
  final String fromName;
  final String fromEmail;
  final DateTime date;
  final bool hasAttachments;
  final String? snippet;

  const MailMessage({
    required this.messageId,
    required this.subject,
    required this.fromName,
    required this.fromEmail,
    required this.date,
    required this.hasAttachments,
    this.snippet,
  });
}

abstract class MailService {
  Future<List<MailMessage>> fetchBulletinMessages();
  Future<List<MailAttachment>> downloadAttachments(MailMessage message);
}