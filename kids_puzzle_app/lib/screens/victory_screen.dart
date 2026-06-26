import 'dart:math';
import 'package:flutter/material.dart';
import '../models/puzzle_data.dart';
import '../utils/responsive.dart';
import 'puzzle_screen.dart';

class VictoryScreen extends StatefulWidget {
  final PuzzleLevel level;
  const VictoryScreen({super.key, required this.level});

  @override
  State<VictoryScreen> createState() => _VictoryScreenState();
}

class _VictoryScreenState extends State<VictoryScreen>
    with TickerProviderStateMixin {
  late AnimationController _starController;
  late AnimationController _confettiController;
  late Animation<double> _starScale;
  final List<_ConfettiParticle> _particles = [];

  @override
  void initState() {
    super.initState();
    _starController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _starScale = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(parent: _starController, curve: Curves.elasticOut),
    );
    _starController.forward();

    _confettiController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    );

    final rng = Random();
    for (int i = 0; i < 40; i++) {
      _particles.add(_ConfettiParticle(
        color: Colors.primaries[rng.nextInt(Colors.primaries.length)],
        x: rng.nextDouble(),
        speed: 0.3 + rng.nextDouble() * 0.7,
        size: 6 + rng.nextDouble() * 10,
        drift: -0.5 + rng.nextDouble(),
      ));
    }
    _confettiController.repeat();
  }

  @override
  void dispose() {
    _starController.dispose();
    _confettiController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFD54F), Color(0xFFFF8A65)],
          ),
        ),
        child: SafeArea(
          child: Stack(
            children: [
              AnimatedBuilder(
                animation: _confettiController,
                builder: (context, _) {
                  return CustomPaint(
                    size: MediaQuery.of(context).size,
                    painter: _ConfettiPainter(
                      particles: _particles,
                      progress: _confettiController.value,
                    ),
                  );
                },
              ),
              Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    ScaleTransition(
                      scale: _starScale,
                      child: Text(
                        '⭐',
                        style: TextStyle(
                          fontSize: Responsive.fontSize(context, 80),
                        ),
                      ),
                    ),
                    SizedBox(height: Responsive.padding(context, 20)),
                    ScaleTransition(
                      scale: _starScale,
                      child: Text(
                        '¡Muy bien!',
                        style: TextStyle(
                          fontSize: Responsive.fontSize(context, 40),
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                          shadows: const [
                            Shadow(
                              color: Colors.black26,
                              offset: Offset(2, 2),
                              blurRadius: 4,
                            ),
                          ],
                        ),
                      ),
                    ),
                    SizedBox(height: Responsive.padding(context, 10)),
                    Text(
                      'Completaste: ${widget.level.title}',
                      style: TextStyle(
                        fontSize: Responsive.fontSize(context, 18),
                        color: Colors.white70,
                      ),
                    ),
                    SizedBox(height: Responsive.padding(context, 40)),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        _buildButton(
                          context,
                          icon: Icons.refresh,
                          label: 'Repetir',
                          color: const Color(0xFF4ECDC4),
                          onTap: () {
                            Navigator.pushReplacement(
                              context,
                              MaterialPageRoute(
                                builder: (_) => PuzzleScreen(level: widget.level),
                              ),
                            );
                          },
                        ),
                        SizedBox(width: Responsive.padding(context, 20)),
                        _buildButton(
                          context,
                          icon: Icons.home,
                          label: 'Inicio',
                          color: const Color(0xFF6C63FF),
                          onTap: () {
                            Navigator.of(context).popUntil((route) => route.isFirst);
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildButton(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: EdgeInsets.symmetric(
            horizontal: Responsive.padding(context, 24),
            vertical: Responsive.padding(context, 14),
          ),
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: color.withOpacity(0.4),
                blurRadius: 10,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Row(
            children: [
              Icon(icon, color: Colors.white, size: Responsive.iconSize(context, 22)),
              SizedBox(width: Responsive.padding(context, 8)),
              Text(
                label,
                style: TextStyle(
                  fontSize: Responsive.fontSize(context, 16),
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}


class _ConfettiParticle {
  final Color color;
  final double x;
  final double speed;
  final double size;
  final double drift;

  _ConfettiParticle({
    required this.color,
    required this.x,
    required this.speed,
    required this.size,
    required this.drift,
  });
}

class _ConfettiPainter extends CustomPainter {
  final List<_ConfettiParticle> particles;
  final double progress;

  _ConfettiPainter({required this.particles, required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in particles) {
      final y = (progress * p.speed * size.height * 2) % (size.height + 20) - 10;
      final x = p.x * size.width + sin(progress * 6 + p.x * 10) * 30 * p.drift;

      final paint = Paint()..color = p.color.withOpacity(0.8);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset(x, y), width: p.size, height: p.size * 0.6),
          Radius.circular(p.size * 0.15),
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _ConfettiPainter old) => true;
}
