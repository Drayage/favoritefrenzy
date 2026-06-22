// firebase-config.js — Firebase 웹 설정.
// 웹 API 키는 공개용으로 설계되어 클라이언트에 노출되어도 안전하며 커밋 가능하다.
// (실제 보안은 Firestore 보안 규칙으로 적용한다. README 참고)

export const firebaseConfig = {
  apiKey: 'AIzaSyDnEYQRvb16iW0HZyq4bgrvtnPysDbeFBc',
  authDomain: 'frenzy-49857.firebaseapp.com',
  projectId: 'frenzy-49857',
  storageBucket: 'frenzy-49857.firebasestorage.app',
  messagingSenderId: '256453631137',
  appId: '1:256453631137:web:453f176b0b349afa44a4e0',
};

// config 가 채워져 있으면 멀티플레이 활성화
export const multiplayerEnabled = !!firebaseConfig.apiKey;
