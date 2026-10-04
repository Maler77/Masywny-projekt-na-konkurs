# Projekt konkursowy — gra przeglądarkowa

Minimalny szkielet gry działającej w nowoczesnej przeglądarce. Projekt używa zwykłego HTML, CSS i JavaScript, bez frameworka i bez zależności do instalowania.

## Uruchomienie

Uruchom lokalny serwer HTTP w katalogu projektu (wymagany dla modułów JavaScript):

```bash
python -m http.server 8000
```

Następnie otwórz <http://localhost:8000>. Wymagany jest Python 3. Polecenie uruchamia serwer tylko na czas pracy; zatrzymasz go przez `Ctrl+C`.

## Struktura

```text
index.html       Strona i punkt wejścia aplikacji
src/
  css/style.css  Wygląd strony i obszaru gry
  js/main.js     Punkt wejścia logiki gry
  js/viewport.js Renderowanie i skalowanie obszaru gry
```

Menu główne jest pierwszym ekranem po otwarciu strony. Przycisk „Rozpocznij grę” uruchamia rozgrywkę i prosi przeglądarkę o tryb fullscreen. Menu pauzy pozostaje na pełnym ekranie podczas gry, gdy przeglądarka obsługuje blokadę klawisza Esc; przy braku tej obsługi Escape może wyjść z trybu przeglądarki, a gra pokaże menu pauzy w układzie wypełniającym stronę. Przycisk „Menu główne” kończy fullscreen. Obszar gry ma układ współrzędnych 960 × 540 i tymczasowe tło. Przy proporcjach innych niż 16:9 renderer zachowuje proporcje świata i dodaje pasy.
