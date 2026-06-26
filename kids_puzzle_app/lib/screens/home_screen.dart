import 'package:flutter/material.dart';
import '../models/puzzle_data.dart';
import '../utils/responsive.dart';
import 'level_select_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with TickerProviderStateMixin {
  late AnimationController _bounceController;
  late Animation<double> _bounceAnimation;

  @override
  void initState() {
    super.initState();
    _bounceController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
    _bounceAnimation = Tween<double>(begin: 0, end: -15).animate(
      CurvedAnimation(parent: _bounceController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _bounceController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isTablet = Responsive.isTablet(context);

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF667EEA), Color(0xFF764BA2)],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              SizedBox(height: Responsive.padding(context, 30)),
              AnimatedBuilder(
                animation: _bounceAnimation,
                builder: (context, child) {
                  return Transform.translate(
                    offset: Offset(0, _bounceAnimation.value),
                    child: child,
                  );
                },
                child: Text(
                  '🧩',
                  style: TextStyle(fontSize: Responsive.fontSize(context, 60)),
                ),
              ),
              SizedBox(height: Responsive.padding(context, 10)),
              Text(
                '¡Arma Figuras!',
                style: TextStyle(
                  fontSize: Responsive.fontSize(context, 36),
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  shadows: const [
                    Shadow(color: Colors.black26, offset: Offset(2, 2), blurRadius: 4),
                  ],
                ),
              ),
              SizedBox(height: Responsive.padding(context, 8)),
              Text(
                'Elige tu edad para empezar',
                style: TextStyle(
                  fontSize: Responsive.fontSize(context, 16),
                  color: Colors.white70,
                ),
              ),
              SizedBox(height: Responsive.padding(context, 40)),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: Responsive.padding(context, isTablet ? 60 : 24),
                  ),
                  child: ListView(
                    children: AgeGroup.values.map((group) {
                      return _AgeGroupCard(ageGroup: group);
                    }).toList(),
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

class _AgeGroupCard extends StatelessWidget {
  final AgeGroup ageGroup;
  const _AgeGroupCard({required this.ageGroup});

  String get _emoji {
    switch (ageGroup) {
      case AgeGroup.baby:
        return '👶';
      case AgeGroup.toddler:
        return '🧒';
      case AgeGroup.kid:
        return '🧑';
    }
  }

  String get _description {
    switch (ageGroup) {
      case AgeGroup.baby:
        return 'Figuras grandes y sencillas';
      case AgeGroup.toddler:
        return 'Más piezas y formas';
      case AgeGroup.kid:
        return 'Desafíos con muchas piezas';
    }
  }

  Color get _color {
    switch (ageGroup) {
      case AgeGroup.baby:
        return const Color(0xFFFF6B6B);
      case AgeGroup.toddler:
        return const Color(0xFF4ECDC4);
      case AgeGroup.kid:
        return const Color(0xFFFFE66D);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: Responsive.padding(context, 16)),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: () {
            Navigator.push(
              context,
              PageRouteBuilder(
                pageBuilder: (_, __, ___) => LevelSelectScreen(ageGroup: ageGroup),
                transitionsBuilder: (_, anim, __, child) {
                  return SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(1, 0),
                      end: Offset.zero,
                    ).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
                    child: child,
                  );
                },
              ),
            );
          },
          child: Container(
            padding: EdgeInsets.all(Responsive.padding(context, 20)),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: _color.withOpacity(0.3),
                  blurRadius: 15,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: Responsive.iconSize(context, 60),
                  height: Responsive.iconSize(context, 60),
                  decoration: BoxDecoration(
                    color: _color.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Center(
                    child: Text(
                      _emoji,
                      style: TextStyle(fontSize: Responsive.fontSize(context, 30)),
                    ),
                  ),
                ),
                SizedBox(width: Responsive.padding(context, 16)),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        ageGroup.label,
                        style: TextStyle(
                          fontSize: Responsive.fontSize(context, 20),
                          fontWeight: FontWeight.bold,
                          color: Colors.black87,
                        ),
                      ),
                      SizedBox(height: Responsive.padding(context, 4)),
                      Text(
                        _description,
                        style: TextStyle(
                          fontSize: Responsive.fontSize(context, 13),
                          color: Colors.black45,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.arrow_forward_ios,
                  color: _color,
                  size: Responsive.iconSize(context, 20),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
