import 'package:flutter/material.dart';

class Responsive {
  static double screenWidth(BuildContext context) =>
      MediaQuery.of(context).size.width;

  static double screenHeight(BuildContext context) =>
      MediaQuery.of(context).size.height;

  static double shortestSide(BuildContext context) =>
      MediaQuery.of(context).size.shortestSide;

  static bool isTablet(BuildContext context) => shortestSide(context) >= 600;

  static double fontSize(BuildContext context, double base) {
    final scale = shortestSide(context) / 400;
    return (base * scale).clamp(base * 0.7, base * 1.8);
  }

  static double iconSize(BuildContext context, double base) {
    final scale = shortestSide(context) / 400;
    return (base * scale).clamp(base * 0.7, base * 2.0);
  }

  static double padding(BuildContext context, double base) {
    final scale = shortestSide(context) / 400;
    return (base * scale).clamp(base * 0.5, base * 2.0);
  }

  static double puzzlePieceSize(BuildContext context, int gridSize) {
    final available = shortestSide(context) * 0.85;
    return (available / gridSize).clamp(50.0, 200.0);
  }
}
