import 'package:flutter/material.dart';

import 'home_screen.dart';
import 'windows_custom_scheme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await ensureWindowsCustomSchemeRegistration();
  } catch (error, stackTrace) {
    debugPrint('Failed to register Windows custom scheme: $error');
    debugPrintStack(stackTrace: stackTrace);
  }

  runApp(const AuthoriFlutterTestApp());
}

class AuthoriFlutterTestApp extends StatelessWidget {
  const AuthoriFlutterTestApp({super.key, this.home = const HomeScreen()});

  final Widget home;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Authori Flutter Test App',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF2563EB)),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
          alignLabelWithHint: true,
        ),
      ),
      home: home,
    );
  }
}
