import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:flutter_testapp/home_screen.dart';
import 'package:flutter_testapp/main.dart';

class _FakeDeepLinkClient implements DeepLinkClient {
  @override
  Future<Uri?> getInitialLink() async => null;

  @override
  Stream<Uri> get uriLinkStream => const Stream<Uri>.empty();
}

void main() {
  testWidgets('renders Authori OAuth test screen', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(
      AuthoriFlutterTestApp(
        home: HomeScreen(
          deepLinkClient: _FakeDeepLinkClient(),
          urlLauncher: (_) async => true,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Authori Flutter 테스트앱'), findsOneWidget);
    expect(find.text('연동 설정'), findsOneWidget);
    expect(find.text('로그인'), findsOneWidget);
    expect(find.text('토큰 원문'), findsOneWidget);
    expect(find.text('Access Token 클레임'), findsOneWidget);
    expect(find.text('Refresh Token 클레임'), findsOneWidget);
  });
}
