import 'package:flutter/material.dart';

enum AgeGroup {
  baby(label: '1-2 años', minAge: 1, maxAge: 2),
  toddler(label: '3-4 años', minAge: 3, maxAge: 4),
  kid(label: '5-7 años', minAge: 5, maxAge: 7);

  final String label;
  final int minAge;
  final int maxAge;
  const AgeGroup({required this.label, required this.minAge, required this.maxAge});
}

class PuzzleShape {
  final String name;
  final IconData icon;
  final Color color;
  final List<Offset> targetPositions;

  const PuzzleShape({
    required this.name,
    required this.icon,
    required this.color,
    required this.targetPositions,
  });
}

class PuzzleLevel {
  final String title;
  final String emoji;
  final AgeGroup ageGroup;
  final int difficulty;
  final List<PuzzlePiece> pieces;
  final Color backgroundColor;

  const PuzzleLevel({
    required this.title,
    required this.emoji,
    required this.ageGroup,
    required this.difficulty,
    required this.pieces,
    required this.backgroundColor,
  });
}

class PuzzlePiece {
  final String id;
  final IconData icon;
  final Color color;
  final double targetX;
  final double targetY;
  final double size;
  final String label;

  const PuzzlePiece({
    required this.id,
    required this.icon,
    required this.color,
    required this.targetX,
    required this.targetY,
    required this.size,
    required this.label,
  });
}

class LevelRepository {
  static List<PuzzleLevel> getLevels(AgeGroup ageGroup) {
    switch (ageGroup) {
      case AgeGroup.baby:
        return _babyLevels;
      case AgeGroup.toddler:
        return _toddlerLevels;
      case AgeGroup.kid:
        return _kidLevels;
    }
  }

  static final List<PuzzleLevel> _babyLevels = [
    PuzzleLevel(
      title: 'Formas Básicas',
      emoji: '⭐',
      ageGroup: AgeGroup.baby,
      difficulty: 1,
      backgroundColor: const Color(0xFFFFF9C4),
      pieces: [
        PuzzlePiece(id: 'circle', icon: Icons.circle, color: Colors.red, targetX: 0.5, targetY: 0.3, size: 1.0, label: 'Círculo'),
        PuzzlePiece(id: 'square', icon: Icons.square, color: Colors.blue, targetX: 0.5, targetY: 0.7, size: 1.0, label: 'Cuadrado'),
      ],
    ),
    PuzzleLevel(
      title: 'Colores',
      emoji: '🌈',
      ageGroup: AgeGroup.baby,
      difficulty: 1,
      backgroundColor: const Color(0xFFE8F5E9),
      pieces: [
        PuzzlePiece(id: 'red', icon: Icons.favorite, color: Colors.red, targetX: 0.3, targetY: 0.5, size: 1.0, label: 'Rojo'),
        PuzzlePiece(id: 'blue', icon: Icons.favorite, color: Colors.blue, targetX: 0.7, targetY: 0.5, size: 1.0, label: 'Azul'),
      ],
    ),
    PuzzleLevel(
      title: 'Animales',
      emoji: '🐱',
      ageGroup: AgeGroup.baby,
      difficulty: 1,
      backgroundColor: const Color(0xFFFCE4EC),
      pieces: [
        PuzzlePiece(id: 'cat', icon: Icons.pets, color: Colors.orange, targetX: 0.3, targetY: 0.5, size: 1.0, label: 'Gato'),
        PuzzlePiece(id: 'bird', icon: Icons.flutter_dash, color: Colors.teal, targetX: 0.7, targetY: 0.5, size: 1.0, label: 'Pájaro'),
      ],
    ),
    PuzzleLevel(
      title: 'Estrellas',
      emoji: '✨',
      ageGroup: AgeGroup.baby,
      difficulty: 2,
      backgroundColor: const Color(0xFFE3F2FD),
      pieces: [
        PuzzlePiece(id: 'star1', icon: Icons.star, color: Colors.amber, targetX: 0.3, targetY: 0.3, size: 1.0, label: 'Estrella'),
        PuzzlePiece(id: 'star2', icon: Icons.star, color: Colors.pink, targetX: 0.7, targetY: 0.3, size: 1.0, label: 'Estrella'),
        PuzzlePiece(id: 'star3', icon: Icons.star, color: Colors.purple, targetX: 0.5, targetY: 0.7, size: 1.0, label: 'Estrella'),
      ],
    ),
  ];

  static final List<PuzzleLevel> _toddlerLevels = [
    PuzzleLevel(
      title: 'Casa',
      emoji: '🏠',
      ageGroup: AgeGroup.toddler,
      difficulty: 2,
      backgroundColor: const Color(0xFFF3E5F5),
      pieces: [
        PuzzlePiece(id: 'roof', icon: Icons.change_history, color: Colors.red, targetX: 0.5, targetY: 0.2, size: 0.9, label: 'Techo'),
        PuzzlePiece(id: 'wall', icon: Icons.square, color: Colors.brown, targetX: 0.5, targetY: 0.5, size: 0.9, label: 'Pared'),
        PuzzlePiece(id: 'door', icon: Icons.door_front_door, color: Colors.amber, targetX: 0.5, targetY: 0.7, size: 0.7, label: 'Puerta'),
        PuzzlePiece(id: 'window', icon: Icons.window, color: Colors.lightBlue, targetX: 0.3, targetY: 0.45, size: 0.5, label: 'Ventana'),
      ],
    ),
    PuzzleLevel(
      title: 'Carita Feliz',
      emoji: '😊',
      ageGroup: AgeGroup.toddler,
      difficulty: 2,
      backgroundColor: const Color(0xFFFFF3E0),
      pieces: [
        PuzzlePiece(id: 'face', icon: Icons.circle, color: Colors.yellow.shade700, targetX: 0.5, targetY: 0.4, size: 1.2, label: 'Cara'),
        PuzzlePiece(id: 'eye1', icon: Icons.circle, color: Colors.brown, targetX: 0.38, targetY: 0.33, size: 0.4, label: 'Ojo'),
        PuzzlePiece(id: 'eye2', icon: Icons.circle, color: Colors.brown, targetX: 0.62, targetY: 0.33, size: 0.4, label: 'Ojo'),
        PuzzlePiece(id: 'mouth', icon: Icons.mood, color: Colors.red, targetX: 0.5, targetY: 0.52, size: 0.5, label: 'Boca'),
      ],
    ),
    PuzzleLevel(
      title: 'Jardín',
      emoji: '🌻',
      ageGroup: AgeGroup.toddler,
      difficulty: 3,
      backgroundColor: const Color(0xFFE8F5E9),
      pieces: [
        PuzzlePiece(id: 'sun', icon: Icons.wb_sunny, color: Colors.amber, targetX: 0.7, targetY: 0.15, size: 0.8, label: 'Sol'),
        PuzzlePiece(id: 'flower1', icon: Icons.local_florist, color: Colors.pink, targetX: 0.25, targetY: 0.65, size: 0.7, label: 'Flor'),
        PuzzlePiece(id: 'flower2', icon: Icons.local_florist, color: Colors.purple, targetX: 0.55, targetY: 0.7, size: 0.7, label: 'Flor'),
        PuzzlePiece(id: 'tree', icon: Icons.park, color: Colors.green, targetX: 0.8, targetY: 0.55, size: 0.9, label: 'Árbol'),
        PuzzlePiece(id: 'cloud', icon: Icons.cloud, color: Colors.lightBlue, targetX: 0.3, targetY: 0.12, size: 0.7, label: 'Nube'),
      ],
    ),
    PuzzleLevel(
      title: 'Transporte',
      emoji: '🚗',
      ageGroup: AgeGroup.toddler,
      difficulty: 3,
      backgroundColor: const Color(0xFFE3F2FD),
      pieces: [
        PuzzlePiece(id: 'car', icon: Icons.directions_car, color: Colors.red, targetX: 0.25, targetY: 0.5, size: 0.8, label: 'Carro'),
        PuzzlePiece(id: 'plane', icon: Icons.flight, color: Colors.blue, targetX: 0.5, targetY: 0.2, size: 0.8, label: 'Avión'),
        PuzzlePiece(id: 'boat', icon: Icons.directions_boat, color: Colors.teal, targetX: 0.75, targetY: 0.5, size: 0.8, label: 'Barco'),
        PuzzlePiece(id: 'train', icon: Icons.train, color: Colors.green, targetX: 0.25, targetY: 0.8, size: 0.8, label: 'Tren'),
        PuzzlePiece(id: 'bike', icon: Icons.pedal_bike, color: Colors.orange, targetX: 0.75, targetY: 0.8, size: 0.8, label: 'Bici'),
      ],
    ),
  ];

  static final List<PuzzleLevel> _kidLevels = [
    PuzzleLevel(
      title: 'Robot',
      emoji: '🤖',
      ageGroup: AgeGroup.kid,
      difficulty: 3,
      backgroundColor: const Color(0xFFEDE7F6),
      pieces: [
        PuzzlePiece(id: 'head', icon: Icons.smart_toy, color: Colors.blueGrey, targetX: 0.5, targetY: 0.15, size: 0.7, label: 'Cabeza'),
        PuzzlePiece(id: 'body', icon: Icons.square, color: Colors.grey, targetX: 0.5, targetY: 0.4, size: 0.9, label: 'Cuerpo'),
        PuzzlePiece(id: 'arm_l', icon: Icons.back_hand, color: Colors.blueGrey, targetX: 0.25, targetY: 0.4, size: 0.5, label: 'Brazo'),
        PuzzlePiece(id: 'arm_r', icon: Icons.front_hand, color: Colors.blueGrey, targetX: 0.75, targetY: 0.4, size: 0.5, label: 'Brazo'),
        PuzzlePiece(id: 'leg_l', icon: Icons.square, color: Colors.grey.shade600, targetX: 0.38, targetY: 0.7, size: 0.45, label: 'Pierna'),
        PuzzlePiece(id: 'leg_r', icon: Icons.square, color: Colors.grey.shade600, targetX: 0.62, targetY: 0.7, size: 0.45, label: 'Pierna'),
      ],
    ),
    PuzzleLevel(
      title: 'Sistema Solar',
      emoji: '🌍',
      ageGroup: AgeGroup.kid,
      difficulty: 4,
      backgroundColor: const Color(0xFF1A237E),
      pieces: [
        PuzzlePiece(id: 'sun', icon: Icons.wb_sunny, color: Colors.amber, targetX: 0.5, targetY: 0.5, size: 1.0, label: 'Sol'),
        PuzzlePiece(id: 'mercury', icon: Icons.circle, color: Colors.grey, targetX: 0.25, targetY: 0.25, size: 0.35, label: 'Mercurio'),
        PuzzlePiece(id: 'venus', icon: Icons.circle, color: Colors.orange, targetX: 0.75, targetY: 0.2, size: 0.4, label: 'Venus'),
        PuzzlePiece(id: 'earth', icon: Icons.circle, color: Colors.blue, targetX: 0.2, targetY: 0.65, size: 0.45, label: 'Tierra'),
        PuzzlePiece(id: 'mars', icon: Icons.circle, color: Colors.red, targetX: 0.8, targetY: 0.7, size: 0.4, label: 'Marte'),
        PuzzlePiece(id: 'moon', icon: Icons.circle, color: Colors.grey.shade300, targetX: 0.28, targetY: 0.55, size: 0.25, label: 'Luna'),
        PuzzlePiece(id: 'star1', icon: Icons.star, color: Colors.white, targetX: 0.1, targetY: 0.1, size: 0.25, label: '⭐'),
      ],
    ),
    PuzzleLevel(
      title: 'Ciudad',
      emoji: '🏙️',
      ageGroup: AgeGroup.kid,
      difficulty: 4,
      backgroundColor: const Color(0xFFE0F7FA),
      pieces: [
        PuzzlePiece(id: 'building1', icon: Icons.apartment, color: Colors.blueGrey, targetX: 0.2, targetY: 0.4, size: 0.8, label: 'Edificio'),
        PuzzlePiece(id: 'building2', icon: Icons.business, color: Colors.brown, targetX: 0.5, targetY: 0.35, size: 0.9, label: 'Oficina'),
        PuzzlePiece(id: 'building3', icon: Icons.domain, color: Colors.grey, targetX: 0.8, targetY: 0.45, size: 0.7, label: 'Torre'),
        PuzzlePiece(id: 'car', icon: Icons.directions_car, color: Colors.red, targetX: 0.35, targetY: 0.8, size: 0.5, label: 'Carro'),
        PuzzlePiece(id: 'tree1', icon: Icons.park, color: Colors.green, targetX: 0.65, targetY: 0.75, size: 0.5, label: 'Árbol'),
        PuzzlePiece(id: 'sun', icon: Icons.wb_sunny, color: Colors.amber, targetX: 0.8, targetY: 0.1, size: 0.6, label: 'Sol'),
        PuzzlePiece(id: 'cloud', icon: Icons.cloud, color: Colors.white, targetX: 0.3, targetY: 0.08, size: 0.5, label: 'Nube'),
      ],
    ),
    PuzzleLevel(
      title: 'Cohete Espacial',
      emoji: '🚀',
      ageGroup: AgeGroup.kid,
      difficulty: 5,
      backgroundColor: const Color(0xFF0D47A1),
      pieces: [
        PuzzlePiece(id: 'nose', icon: Icons.change_history, color: Colors.red, targetX: 0.5, targetY: 0.1, size: 0.6, label: 'Punta'),
        PuzzlePiece(id: 'body1', icon: Icons.square, color: Colors.white, targetX: 0.5, targetY: 0.3, size: 0.7, label: 'Cuerpo'),
        PuzzlePiece(id: 'body2', icon: Icons.square, color: Colors.grey.shade300, targetX: 0.5, targetY: 0.5, size: 0.7, label: 'Cuerpo'),
        PuzzlePiece(id: 'wing_l', icon: Icons.change_history, color: Colors.blue, targetX: 0.3, targetY: 0.55, size: 0.5, label: 'Ala'),
        PuzzlePiece(id: 'wing_r', icon: Icons.change_history, color: Colors.blue, targetX: 0.7, targetY: 0.55, size: 0.5, label: 'Ala'),
        PuzzlePiece(id: 'window', icon: Icons.circle, color: Colors.lightBlue, targetX: 0.5, targetY: 0.35, size: 0.35, label: 'Ventana'),
        PuzzlePiece(id: 'fire1', icon: Icons.local_fire_department, color: Colors.orange, targetX: 0.42, targetY: 0.72, size: 0.5, label: 'Fuego'),
        PuzzlePiece(id: 'fire2', icon: Icons.local_fire_department, color: Colors.red, targetX: 0.58, targetY: 0.72, size: 0.5, label: 'Fuego'),
      ],
    ),
  ];
}
