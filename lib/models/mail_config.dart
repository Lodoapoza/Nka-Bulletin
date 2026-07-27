enum MailProviderType { google, microsoft, imap }

class MailConfig {
  final int? id;
  final String email;
  final String displayName;
  final MailProviderType providerType;
  final String? accessToken;
  final String? refreshToken;
  final String? imapHost;
  final int? imapPort;
  final String? imapLogin;
  final String? imapPassword;
  final bool isActive;
  final DateTime? lastChecked;
  final int? unreadCount;

  const MailConfig({
    this.id,
    required this.email,
    required this.displayName,
    required this.providerType,
    this.accessToken,
    this.refreshToken,
    this.imapHost,
    this.imapPort,
    this.imapLogin,
    this.imapPassword,
    this.isActive = true,
    this.lastChecked,
    this.unreadCount,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'email': email,
      'display_name': displayName,
      'provider_type': providerType.name,
      'access_token': accessToken,
      'refresh_token': refreshToken,
      'imap_host': imapHost,
      'imap_port': imapPort,
      'imap_login': imapLogin,
      'imap_password': imapPassword,
      'is_active': isActive ? 1 : 0,
      'last_checked': lastChecked?.toIso8601String(),
      'unread_count': unreadCount,
    };
  }

  factory MailConfig.fromMap(Map<String, dynamic> map) {
    return MailConfig(
      id: map['id'] as int?,
      email: map['email'] as String,
      displayName: map['display_name'] as String,
      providerType: MailProviderType.values.firstWhere(
        (e) => e.name == map['provider_type'],
        orElse: () => MailProviderType.imap,
      ),
      accessToken: map['access_token'] as String?,
      refreshToken: map['refresh_token'] as String?,
      imapHost: map['imap_host'] as String?,
      imapPort: map['imap_port'] as int?,
      imapLogin: map['imap_login'] as String?,
      imapPassword: map['imap_password'] as String?,
      isActive: (map['is_active'] as int?) == 1,
      lastChecked: map['last_checked'] != null
          ? DateTime.parse(map['last_checked'] as String)
          : null,
      unreadCount: map['unread_count'] as int?,
    );
  }
}