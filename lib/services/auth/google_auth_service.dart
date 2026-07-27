import 'package:google_sign_in/google_sign_in.dart';

class GoogleSignInResult {
  final String? accessToken;
  final String? idToken;
  final String email;
  final String? displayName;
  final String? photoUrl;

  const GoogleSignInResult({
    this.accessToken,
    this.idToken,
    required this.email,
    this.displayName,
    this.photoUrl,
  });
}

class GoogleAuthService {
  final GoogleSignIn _googleSignIn = GoogleSignIn(
    scopes: [
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
  );

  Future<GoogleSignInResult?> signIn() async {
    try {
      final user = await _googleSignIn.signIn();
      if (user == null) return null;

      final auth = await user.authentication;
      return GoogleSignInResult(
        accessToken: auth.accessToken,
        idToken: auth.idToken,
        email: user.email,
        displayName: user.displayName,
        photoUrl: user.photoUrl,
      );
    } catch (e) {
      rethrow;
    }
  }

  Future<void> signOut() async {
    await _googleSignIn.signOut();
  }
}
