// Bama per-type history — full-page "See all" for one record type.
// Opened from welcome log sections via /adviser/bama/history?type=...
// with the live list + resume/delete callbacks in extra.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';

import '../../core/config.dart';
import '../../design/screen_search.dart';
import '../../shared/widgets.dart';
import 'bama_conversations.dart';

class BamaHistoryPage extends StatefulWidget {
  final String type;
  final List<BamaConversation> conversations;
  final Future<void> Function(String) onResume;
  final ValueChanged<BamaConversation> onDelete;
  const BamaHistoryPage({
    super.key,
    required this.type,
    required this.conversations,
    required this.onResume,
    required this.onDelete,
  });

  @override
  State<BamaHistoryPage> createState() => _State();
}

class _State extends State<BamaHistoryPage> {
  final _q = TextEditingController();
  late List<BamaConversation> _items;
  StreamSubscription<BoxEvent>? _storeChanges;

  @override
  void initState() {
    super.initState();
    _items = [for (final c in widget.conversations) if (c.type == 'anecdotal') c];
    _storeChanges = Hive.box(AppConfig.bamaBox)
        .watch(key: 'conversations').listen((_) => _reloadItems());
  }

  void _reloadItems() {
    if (!mounted) return;
    final stored = Hive.box(AppConfig.bamaBox).get('conversations');
    final updated = <BamaConversation>[];
    for (final raw in stored is List ? stored : const []) {
      try {
        final chat = BamaConversation.fromJson(Map<String, dynamic>.from(raw as Map));
        if (chat.type == 'anecdotal') updated.add(chat);
      } catch (_) {
        // Match the landing page's tolerance for old/corrupt rows.
      }
    }
    updated.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    setState(() => _items = updated);
  }

  @override
  void dispose() {
    _storeChanges?.cancel();
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Header search when inside the staff shell; local field otherwise.
    final scope = ScreenSearchScope.maybeOf(context);
    final needle = (scope?.query ?? _q.text).trim().toLowerCase();
    final shown = _items.where((c) {
      if (needle.isEmpty) return true;
      return c.title.toLowerCase().contains(needle) || c.messages.any((m) => m.text.toLowerCase().contains(needle));
    }).toList();
    const title = 'Anecdotal logs';
    return Column(children: [
      if (scope == null)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            controller: _q,
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 18), hintText: 'Search chats…'),
            onChanged: (_) => setState(() {}),
          ),
        ),
      Expanded(
        child: shown.isEmpty
            ? ZEmptyPage(
                icon: Icons.history_edu_outlined,
                title: _items.isEmpty
                    ? 'No ${title.toLowerCase()} yet'
                    : 'No chats match',
                subtitle: _items.isEmpty
                    ? 'Conversations you file through Bama appear here.'
                    : 'Try a different search.',
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                itemCount: shown.length,
                separatorBuilder: (context, _) => const SizedBox(height: 8),
                itemBuilder: (context, i) {
                  final c = shown[i];
                  return Card(
                    margin: EdgeInsets.zero,
                    child: ListTile(
                      dense: true,
                      title: Text(c.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        '${c.messages.length} messages${c.filed ? ' · Filed' : ''}',
                        style: const TextStyle(fontSize: 12, fontFeatures: [FontFeature.tabularFigures()]),
                      ),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline, size: 18),
                        onPressed: () {
                          widget.onDelete(c);
                          setState(() => _items.removeWhere((e) => e.id == c.id));
                        },
                      ),
                      onTap: () async {
                        await widget.onResume(c.id);
                        _reloadItems();
                      },
                    ),
                  );
                },
              ),
      ),
    ]);
  }
}
