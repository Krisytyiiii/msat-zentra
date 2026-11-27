/// Server-configured periods, using the same lunch/recess precedence as web.
class SchoolDayConfig {
  SchoolDayConfig._(this.periods);
  final List<({int start, int end})> periods;

  /// Null-safe parse for payloads that may omit the day shape.
  static SchoolDayConfig? tryFromJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    try {
      return SchoolDayConfig.fromJson(json);
    } catch (_) {
      return null;
    }
  }

  factory SchoolDayConfig.fromJson(Map<String, dynamic> json) {
    int number(Object? value, int min, int max) {
      if (value is! int || value < min || value > max) {
        throw const FormatException('Invalid timetable configuration');
      }
      return value;
    }

    final match = RegExp(r'^(\d{2}):(\d{2})$')
        .firstMatch(json['startTime']?.toString() ?? '');
    if (match == null) {
      throw const FormatException('Missing timetable start time');
    }
    var minute =
        number(int.parse(match[1]!), 0, 23) * 60 +
        number(int.parse(match[2]!), 0, 59);
    final duration = number(json['periodMins'], 1, 240);
    ({int after, int minutes, bool enabled}) pause(
      String key, {
      bool lunch = false,
    }) {
      final data = json[key];
      if (data is! Map) throw const FormatException('Missing timetable break');
      return (
        after: number(data['afterPeriod'], 1, 8),
        enabled: lunch || data['enabled'] == true,
        minutes: lunch || data['enabled'] == true
            ? number(data['mins'], 0, 240)
            : 0,
      );
    }

    final lunch = pause('lunch', lunch: true);
    final morning = pause('morningRecess');
    final afternoon = pause('afternoonRecess');
    final periods = <({int start, int end})>[];
    for (var i = 1; i <= 8; i++) {
      if (minute + duration > 1440) {
        throw const FormatException('Timetable exceeds one day');
      }
      periods.add((start: minute, end: minute + duration));
      minute += duration;
      if (lunch.after == i) {
        minute += lunch.minutes;
      } else if (morning.after == i && morning.enabled) {
        minute += morning.minutes;
      } else if (afternoon.after == i && afternoon.enabled) {
        minute += afternoon.minutes;
      }
    }
    return SchoolDayConfig._(periods);
  }
}

DateTime philippineTime(DateTime instant) =>
    instant.toUtc().add(const Duration(hours: 8));

/// "7:30 AM" for a minute count after midnight (schedule period windows).
String clockLabel(int minutes) {
  final hour24 = (minutes ~/ 60) % 24;
  final minute = minutes % 60;
  final suffix = hour24 >= 12 ? 'PM' : 'AM';
  final hour = hour24 % 12 == 0 ? 12 : hour24 % 12;
  return '$hour:${minute.toString().padLeft(2, '0')} $suffix';
}
