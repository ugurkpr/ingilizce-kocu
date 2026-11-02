# İngilizce Koçu

Uğur'un kişisel İngilizce ders sitesi (PWA). Yayın: https://ugurkpr.github.io/ingilizce-kocu/

- `index.html`, `app.css`, `app.js`, `content.js` — uygulama kabuğu (tek sayfa, hash route).
- `data/` — tüm veriler JSON olarak burada: `course/` (plan, referans), `lessons/` (dersler, sınavlar, tekrar günleri), `homework/`, `grades/`, `exams/`, `progress/`.
- Uygulama verileri GitHub Contents API ile okur/yazar (Ayarlar'da fine-grained token, sadece bu depo, Contents: read & write). Token yoksa Pages'ten okur, yazmaları cihazda kuyruklar.
- Claude API anahtarı da Ayarlar'da girilir; anahtarlar yalnızca tarayıcı localStorage'ında durur, depoya yazılmaz.
- `sw.js` + `manifest.webmanifest` — ana ekrana eklenebilir; `data/` ve API çağrıları önbelleğe alınmaz.
