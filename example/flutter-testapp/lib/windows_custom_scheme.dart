import 'dart:io';

import 'package:win32_registry/win32_registry.dart';

const String _customScheme = 'authori';
const String _protocolRegistryBasePath = 'Software\\Classes';
const String _appDisplayName = 'Authori Flutter Test App';

Future<void> ensureWindowsCustomSchemeRegistration() async {
  if (!Platform.isWindows) {
    return;
  }

  final appPath = Platform.resolvedExecutable;
  final protocolKey = CURRENT_USER.create(
    '$_protocolRegistryBasePath\\$_customScheme',
  );

  protocolKey.setValue('', RegistryValue.string(_appDisplayName));
  protocolKey.setValue('URL Protocol', const RegistryValue.string(''));

  final commandKey = protocolKey.create('shell\\open\\command');
  commandKey.setValue('', RegistryValue.string('"$appPath" "%1"'));
  commandKey.close();
  protocolKey.close();
}
