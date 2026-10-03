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

Obszar gry ma proporcje 16:9 i używa stałego układu współrzędnych 960 × 540, skalowanego do szerokości strony. Przycisk „Rozpocznij grę” rozwija scenę na całe okno strony (bez uruchamiania trybu fullscreen przeglądarki). Scena zawiera tymczasowe tło i siatkę. Nie zawiera mechanik rozgrywki.
