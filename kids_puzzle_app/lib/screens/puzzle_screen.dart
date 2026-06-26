import 'dart:math';
import 'package:flutter/material.dart';
import '../models/puzzle_data.dart';
import '../utils/responsive.dart';
import 'victory_screen.dart';

class PuzzleScreen extends StatefulWidget {
  final PuzzleLevel level;
  const PuzzleScreen({super.key, required this.level});

  @override
  State<PuzzleScreen> createState() => _PuzzleScreenState();
}

class _PuzzleScreenState extends State<PuzzleScreen>
    with TickerProviderStateMixin {
  final Map<String, Offset> _piecePositions = {};
  final Set<String> _placedPieces = {};
  final Map<String, AnimationController> _pulseControllers = {};
  late Size _areaSize;
  bool _initialized = false;

  @override
  void dispose() {
    for (final c in _pulseControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _initPositions(Size size) {
    if (_initialized) return;
    _initialized = true;
    _areaSize = size;

    final rng = Random();
    final pieces = widget.level.pieces;

    for (final piece in pieces) {
      final margin = 60.0;
      final x = margin + rng.nextDouble() * (size.width - margin * 2 - 60);
      final y = size.height * 0.65 + rng.nextDouble() * (size.height * 0.25);
      _piecePositions[piece.id] = Offset(x, y);
    }

    for (final piece in pieces) {
      _pulseControllers[piece.id] = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 600),
      );
    }
  }

  Offset _targetPosition(PuzzlePiece piece) {
    return Offset(
      piece.targetX * _areaSize.width,
      piece.targetY * _areaSize.height * 0.6,
    );
  }

  void _onPiecePlaced(PuzzlePiece piece, Offset position) {
    final target = _targetPosition(piece);
    final baseSize = Responsive.puzzlePieceSize(context, widget.level.pieces.length);
    final pieceSize = baseSize * piece.size;
    final threshold = pieceSize * 0.5;

    if ((position - target).distance < threshold) {
      setState(() {
        _piecePositions[piece.id] = target;
        _placedPieces.add(piece.id);
      });

      _pulseControllers[piece.id]?.forward().then((_) {
        _pulseControllers[piece.id]?.reverse();
      });

      if (_placedPieces.length == widget.level.pieces.length) {
        Future.delayed(const Duration(milliseconds: 500), () {
          if (mounted) {
            Navigator.pushReplacement(
              context,
              PageRouteBuilder(
                pageBuilder: (_, __, ___) => VictoryScreen(level: widget.level),
                transitionsBuilder: (_, anim, __, child) {
                  return ScaleTransition(scale: anim, child: child);
                },
              ),
            );
          }
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTablet = Responsive.isTablet(context);

    return Scaffold(
      body: Container(
        color: widget.level.backgroundColor,
        child: SafeArea(
          child: Column(
            children: [
              _buildHeader(context),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final size = Size(constraints.maxWidth, constraints.maxHeight);
                    _initPositions(size);
                    return _buildPuzzleArea(context, size);
                  },
                ),
              ),
              _buildPieceCounter(context),
              SizedBox(height: Responsive.padding(context, 8)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: EdgeInsets.symmetric(
        horizontal: Responsive.padding(context, 16),
        vertical: Responsive.padding(context, 8),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.pop(context),
            icon: Icon(
              Icons.arrow_back_ios,
              color: _textColor,
              size: Responsive.iconSize(context, 24),
            ),
          ),
          Expanded(
            child: Text(
              '${widget.level.emoji} ${widget.level.title}',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: Responsive.fontSize(context, 22),
                fontWeight: FontWeight.bold,
                color: _textColor,
              ),
            ),
          ),
          IconButton(
            onPressed: _resetPuzzle,
            icon: Icon(
              Icons.refresh,
              color: _textColor,
              size: Responsive.iconSize(context, 24),
            ),
          ),
        ],
      ),
    );
  }

  Color get _textColor {
    final bg = widget.level.backgroundColor;
    final luminance = bg.computeLuminance();
    return luminance > 0.5 ? Colors.black87 : Colors.white;
  }

  Widget _buildPuzzleArea(BuildContext context, Size size) {
    return Stack(
      children: [
        ...widget.level.pieces.map((piece) => _buildTarget(piece)),
        ...widget.level.pieces
            .where((p) => !_placedPieces.contains(p.id))
            .map((piece) => _buildDraggablePiece(piece)),
        ...widget.level.pieces
            .where((p) => _placedPieces.contains(p.id))
            .map((piece) => _buildPlacedPiece(piece)),
      ],
    );
  }

  Widget _buildTarget(PuzzlePiece piece) {
    final target = _targetPosition(piece);
    final baseSize = Responsive.puzzlePieceSize(context, widget.level.pieces.length);
    final pieceSize = baseSize * piece.size;

    return Positioned(
      left: target.dx - pieceSize / 2,
      top: target.dy - pieceSize / 2,
      child: Container(
        width: pieceSize,
        height: pieceSize,
        decoration: BoxDecoration(
          border: Border.all(
            color: _placedPieces.contains(piece.id)
                ? Colors.transparent
                : piece.color.withOpacity(0.3),
            width: 2,
            strokeAlign: BorderSide.strokeAlignCenter,
          ),
          borderRadius: BorderRadius.circular(pieceSize * 0.2),
          color: _placedPieces.contains(piece.id)
              ? Colors.transparent
              : piece.color.withOpacity(0.08),
        ),
        child: _placedPieces.contains(piece.id)
            ? null
            : Center(
                child: Icon(
                  piece.icon,
                  size: pieceSize * 0.5,
                  color: piece.color.withOpacity(0.15),
                ),
              ),
      ),
    );
  }

  Widget _buildDraggablePiece(PuzzlePiece piece) {
    final pos = _piecePositions[piece.id] ?? Offset.zero;
    final baseSize = Responsive.puzzlePieceSize(context, widget.level.pieces.length);
    final pieceSize = baseSize * piece.size;

    return Positioned(
      left: pos.dx - pieceSize / 2,
      top: pos.dy - pieceSize / 2,
      child: GestureDetector(
        onPanUpdate: (details) {
          setState(() {
            _piecePositions[piece.id] = _piecePositions[piece.id]! + details.delta;
          });
        },
        onPanEnd: (_) {
          _onPiecePlaced(piece, _piecePositions[piece.id]!);
        },
        child: Container(
          width: pieceSize,
          height: pieceSize,
          decoration: BoxDecoration(
            color: piece.color,
            borderRadius: BorderRadius.circular(pieceSize * 0.2),
            boxShadow: [
              BoxShadow(
                color: piece.color.withOpacity(0.4),
                blurRadius: 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                piece.icon,
                size: pieceSize * 0.45,
                color: Colors.white,
              ),
              if (widget.level.ageGroup == AgeGroup.baby)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: FittedBox(
                    child: Text(
                      piece.label,
                      style: TextStyle(
                        fontSize: pieceSize * 0.15,
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPlacedPiece(PuzzlePiece piece) {
    final target = _targetPosition(piece);
    final baseSize = Responsive.puzzlePieceSize(context, widget.level.pieces.length);
    final pieceSize = baseSize * piece.size;

    return Positioned(
      left: target.dx - pieceSize / 2,
      top: target.dy - pieceSize / 2,
      child: ScaleTransition(
        scale: Tween<double>(begin: 1.0, end: 1.15).animate(
          CurvedAnimation(
            parent: _pulseControllers[piece.id]!,
            curve: Curves.easeOut,
          ),
        ),
        child: Container(
          width: pieceSize,
          height: pieceSize,
          decoration: BoxDecoration(
            color: piece.color,
            borderRadius: BorderRadius.circular(pieceSize * 0.2),
            boxShadow: [
              BoxShadow(
                color: piece.color.withOpacity(0.5),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(piece.icon, size: pieceSize * 0.45, color: Colors.white),
              if (widget.level.ageGroup == AgeGroup.baby)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: FittedBox(
                    child: Text(
                      piece.label,
                      style: TextStyle(
                        fontSize: pieceSize * 0.15,
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPieceCounter(BuildContext context) {
    final total = widget.level.pieces.length;
    final placed = _placedPieces.length;

    return Padding(
      padding: EdgeInsets.all(Responsive.padding(context, 12)),
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: Responsive.padding(context, 20),
          vertical: Responsive.padding(context, 10),
        ),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.9),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.extension, color: Colors.amber, size: Responsive.iconSize(context, 20)),
            SizedBox(width: Responsive.padding(context, 8)),
            Text(
              '$placed / $total piezas',
              style: TextStyle(
                fontSize: Responsive.fontSize(context, 16),
                fontWeight: FontWeight.bold,
                color: Colors.black87,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _resetPuzzle() {
    setState(() {
      _placedPieces.clear();
      _initialized = false;
    });
  }
}
