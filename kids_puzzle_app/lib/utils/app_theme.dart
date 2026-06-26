import 'package:flutter/material.dart';

class AppTheme {
  static const primaryColor = Color(0xFF6C63FF);
  static const secondaryColor = Color(0xFFFF6584);

  static final babyColors = [
    const Color(0xFFFF6B6B),
    const Color(0xFF4ECDC4),
    const Color(0xFFFFE66D),
    const Color(0xFF95E1D3),
  ];

  static final toddlerColors = [
    const Color(0xFF6C63FF),
    const Color(0xFFFF6584),
    const Color(0xFF45B7D1),
    const Color(0xFFFFA07A),
  ];

  static final kidColors = [
    const Color(0xFF2D3436),
    const Color(0xFF0984E3),
    const Color(0xFF00B894),
    const Color(0xFFE17055),
  ];

  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        colorSchemeSeed: primaryColor,
        fontFamily: 'Roboto',
      );

  static BoxDecoration cardDecoration(Color color) => BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      );
}
