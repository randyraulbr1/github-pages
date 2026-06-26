import 'package:flutter/material.dart';
import '../models/puzzle_data.dart';
import '../utils/responsive.dart';
import 'puzzle_screen.dart';

class LevelSelectScreen extends StatelessWidget {
  final AgeGroup ageGroup;
  const LevelSelectScreen({super.key, required this.ageGroup});

  Color get _headerColor {
    switch (ageGroup) {
      case AgeGroup.baby:
        return const Color(0xFFFF6B6B);
      case AgeGroup.toddler:
        return const Color(0xFF4ECDC4);
      case AgeGroup.kid:
        return const Color(0xFF6C63FF);
    }
  }

  @override
  Widget build(BuildContext context) {
    final levels = LevelRepository.getLevels(ageGroup);
    final isTablet = Responsive.isTablet(context);
    final crossCount = isTablet ? 3 : 2;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [_headerColor, _headerColor.withOpacity(0.3)],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: EdgeInsets.all(Responsive.padding(context, 16)),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: Icon(
                        Icons.arrow_back_ios,
                        color: Colors.white,
                        size: Responsive.iconSize(context, 24),
                      ),
                    ),
                    Expanded(
                      child: Text(
                        ageGroup.label,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: Responsive.fontSize(context, 24),
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    SizedBox(width: Responsive.iconSize(context, 48)),
                  ],
                ),
              ),
              Text(
                'Elige un nivel',
                style: TextStyle(
                  fontSize: Responsive.fontSize(context, 16),
                  color: Colors.white70,
                ),
              ),
              SizedBox(height: Responsive.padding(context, 20)),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: Responsive.padding(context, isTablet ? 40 : 16),
                  ),
                  child: GridView.builder(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: crossCount,
                      mainAxisSpacing: Responsive.padding(context, 16),
                      crossAxisSpacing: Responsive.padding(context, 16),
                      childAspectRatio: 0.85,
                    ),
                    itemCount: levels.length,
                    itemBuilder: (context, index) {
                      return _LevelCard(
                        level: levels[index],
                        index: index,
                        color: _headerColor,
                      );
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LevelCard extends StatelessWidget {
  final PuzzleLevel level;
  final int index;
  final Color color;

  const _LevelCard({
    required this.level,
    required this.index,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () {
          Navigator.push(
            context,
            PageRouteBuilder(
              pageBuilder: (_, __, ___) => PuzzleScreen(level: level),
              transitionsBuilder: (_, anim, __, child) {
                return FadeTransition(opacity: anim, child: child);
              },
            ),
          );
        },
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                level.emoji,
                style: TextStyle(fontSize: Responsive.fontSize(context, 44)),
              ),
              SizedBox(height: Responsive.padding(context, 12)),
              Text(
                level.title,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: Responsive.fontSize(context, 16),
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
              SizedBox(height: Responsive.padding(context, 8)),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  level.difficulty,
                  (i) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1),
                    child: Icon(
                      Icons.star,
                      size: Responsive.iconSize(context, 14),
                      color: Colors.amber,
                    ),
                  ),
                ),
              ),
              SizedBox(height: Responsive.padding(context, 4)),
              Text(
                '${level.pieces.length} piezas',
                style: TextStyle(
                  fontSize: Responsive.fontSize(context, 12),
                  color: Colors.black38,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
