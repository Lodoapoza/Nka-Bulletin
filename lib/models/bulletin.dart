class Bulletin {
  final int? id;
  final String studentName;
  final String schoolName;
  final String classLevel;
  final String trimester;
  final String filePath;
  final DateTime downloadDate;
  final String sourceEmail;
  final int fileSize;
  final String? summary;

  const Bulletin({
    this.id,
    required this.studentName,
    required this.schoolName,
    required this.classLevel,
    required this.trimester,
    required this.filePath,
    required this.downloadDate,
    required this.sourceEmail,
    required this.fileSize,
    this.summary,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'student_name': studentName,
      'school_name': schoolName,
      'class_level': classLevel,
      'trimester': trimester,
      'file_path': filePath,
      'download_date': downloadDate.toIso8601String(),
      'source_email': sourceEmail,
      'file_size': fileSize,
      'summary': summary,
    };
  }

  factory Bulletin.fromMap(Map<String, dynamic> map) {
    return Bulletin(
      id: map['id'] as int?,
      studentName: map['student_name'] as String,
      schoolName: map['school_name'] as String,
      classLevel: map['class_level'] as String,
      trimester: map['trimester'] as String,
      filePath: map['file_path'] as String,
      downloadDate: DateTime.parse(map['download_date'] as String),
      sourceEmail: map['source_email'] as String,
      fileSize: map['file_size'] as int,
      summary: map['summary'] as String?,
    );
  }

  Bulletin copyWith({
    int? id,
    String? studentName,
    String? schoolName,
    String? classLevel,
    String? trimester,
    String? filePath,
    DateTime? downloadDate,
    String? sourceEmail,
    int? fileSize,
    String? summary,
  }) {
    return Bulletin(
      id: id ?? this.id,
      studentName: studentName ?? this.studentName,
      schoolName: schoolName ?? this.schoolName,
      classLevel: classLevel ?? this.classLevel,
      trimester: trimester ?? this.trimester,
      filePath: filePath ?? this.filePath,
      downloadDate: downloadDate ?? this.downloadDate,
      sourceEmail: sourceEmail ?? this.sourceEmail,
      fileSize: fileSize ?? this.fileSize,
      summary: summary ?? this.summary,
    );
  }
}