import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

final savePanelHeight = ValueNotifier<double>(0);

/// Shared bottom-right lane for floating creation controls.
class FloatingAdd extends StatelessWidget {
  const FloatingAdd({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<double>(
    valueListenable: savePanelHeight,
    builder: (context, height, _) {
      final media = MediaQuery.of(context);
      final bottom =
          media.viewPadding.bottom.clamp(12.0, double.infinity) +
          60 +
          8 +
          (height > 0 ? height + 12 : 12);
      return Padding(
        padding: EdgeInsets.only(bottom: bottom),
        child: Theme(
          data: Theme.of(context).copyWith(
            floatingActionButtonTheme: const FloatingActionButtonThemeData(
              backgroundColor: Color(0xFF2563EB),
              foregroundColor: Colors.white,
            ),
          ),
          child: child,
        ),
      );
    },
  );
}

class FloatingAddLocation extends FloatingActionButtonLocation {
  const FloatingAddLocation();

  @override
  Offset getOffset(ScaffoldPrelayoutGeometry scaffoldGeometry) => Offset(
    scaffoldGeometry.scaffoldSize.width -
        scaffoldGeometry.floatingActionButtonSize.width -
        16,
    scaffoldGeometry.scaffoldSize.height -
        scaffoldGeometry.floatingActionButtonSize.height,
  );
}

class SavePanelMeasure extends SingleChildRenderObjectWidget {
  const SavePanelMeasure({super.key, required super.child});

  @override
  RenderObject createRenderObject(BuildContext context) => _PanelMeasure();
}

class _PanelMeasure extends RenderProxyBox {
  @override
  void performLayout() {
    super.performLayout();
    final height = size.height;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (attached && savePanelHeight.value != height) {
        savePanelHeight.value = height;
      }
    });
  }
}
