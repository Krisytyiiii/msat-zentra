import '../../core/api_client.dart';
import '../../shared/names.dart';

const assessmentTypes = {
  'WRITTEN_WORK': 'Written Work',
  'PERFORMANCE_TASK': 'Performance Task',
  'EXAM': 'Exam',
};

String gradeNumber(num value) => value == value.roundToDouble()
    ? value.toInt().toString()
    : value.toString();

class RecordLearner {
  RecordLearner(Map<String, dynamic> json)
    : id = json['id']?.toString() ?? json['studentId']?.toString() ?? '',
      name = json['name']?.toString() ?? '',
      lrn = json['lrn']?.toString() ?? '',
      isAdm = json['isAdm'] == true,
      finalGrade = json['final'] is Map
          ? Map<String, dynamic>.from(json['final'] as Map)
          : null;
  final String id;
  final String name;
  final String lrn;
  final bool isAdm;
  final Map<String, dynamic>? finalGrade;
  bool get locked =>
      const ['locked', 'adviser_approved'].contains(finalGrade?['lockStatus']);
  String get displayName => formatSurnameFirst(name);
}

class RecordAssessment {
  RecordAssessment(Map<String, dynamic> json, this.type)
    : id = json['id'] as String,
      title = json['title']?.toString() ?? '',
      maxScore = (json['maxScore'] as num).toDouble(),
      dateGiven = json['dateGiven']?.toString() ?? '',
      audience = json['audience']?.toString() ?? 'regular',
      scores = {
        for (final entry in (json['scores'] as Map? ?? {}).entries)
          if (entry.value is num)
            entry.key.toString(): (entry.value as num).toDouble(),
      };
  final String id;
  final String title;
  final double maxScore;
  final String dateGiven;
  final String type;
  final String audience;
  final Map<String, double> scores;
}

class ClassRecord {
  ClassRecord.fromJson(Map<String, dynamic> json)
    : assignment = Map<String, dynamic>.from(json['assignment'] as Map? ?? {}),
      learners = [
        for (final row in json['students'] as List? ?? [])
          RecordLearner(Map<String, dynamic>.from(row as Map)),
      ],
      assessments = [
        for (final component in json['components'] as List? ?? [])
          for (final row in component['assessments'] as List? ?? [])
            RecordAssessment(
              Map<String, dynamic>.from(row as Map),
              component['type'] as String,
            ),
      ],
      weights = {
        for (final component in json['components'] as List? ?? [])
          component['type'] as String: (component['weight'] as num? ?? 0)
              .toDouble(),
      } {
    learners.sort(
      (a, b) => compareSurnameFirst(a.name, b.name),
    );
  }
  final Map<String, dynamic> assignment;
  final List<RecordLearner> learners;
  final List<RecordAssessment> assessments;
  final Map<String, double> weights;
}

/// Uses the same routes and bodies as web services/teacher/grading.service.ts.
class GradebookService {
  const GradebookService(this.api);
  final ApiClient api;
  Future<ClassRecord> load(String classId) async {
    final response = await api.dio.get(
      '/api/teacher/grading/classes/${Uri.encodeComponent(classId)}',
    );
    return ClassRecord.fromJson(
      Map<String, dynamic>.from(response.data as Map),
    );
  }

  Future<void> score(String assessmentId, String learnerId, double raw) async {
    await api.dio.post(
      '/api/grades/assessments/${Uri.encodeComponent(assessmentId)}/score',
      data: {'studentId': learnerId, 'rawScore': raw},
    );
  }

  Future<Map<String, dynamic>> scores(
    String assessmentId,
    List<Map<String, dynamic>> scores,
  ) async {
    final response = await api.dio.post(
      '/api/grades/assessments/${Uri.encodeComponent(assessmentId)}/scores',
      data: {'scores': scores},
    );
    return Map<String, dynamic>.from(response.data as Map);
  }

  Future<String> add(
    String classId, {
    required String type,
    required String title,
    required double maxScore,
    required String audience,
  }) async {
    final response = await api.dio.post(
      '/api/teacher/grading/classes/${Uri.encodeComponent(classId)}/assessments',
      data: {
        'componentType': type,
        'title': title,
        'maxScore': maxScore,
        'audience': audience,
      },
    );
    return (response.data as Map)['id'] as String;
  }
}
