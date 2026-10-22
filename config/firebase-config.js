// РЕЖИМ ДЕМОНСТРАЦИИ: пока enabled = false, брони хранятся в localStorage.
// Для общего бронирования между разными посетителями:
// 1) Создайте Firebase проект, добавьте Web App и Cloud Firestore.
// 2) В Authentication включите анонимный вход.
// 3) Опубликуйте правила из config/firestore.rules.
// 4) Вставьте конфигурацию Firebase ниже и установите enabled: true.
// Не размещайте здесь секретные ключи доступа сервера. Веб-конфигурация Firebase публичная;
// доступ к данным защищается правилами Firestore.
const firebaseSettings = {
  enabled: false,
  config: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: ''
  }
};
