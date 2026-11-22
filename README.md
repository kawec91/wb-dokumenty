# WB Dokumenty 1.0

Mobilna aplikacja do przekazywania dokumentów księgowych WhiteBull. Pracownik otwiera nieprzewidywalny link z QR, deklaruje wcześniej zatwierdzony numer telefonu i przesyła zdjęcia lub PDF. Panel WB Auth obsługuje księgowość i administratorów. Oryginały trafiają do współdzielonego magazynu WhiteBull Drive, a PostgreSQL przechowuje metadane, statusy i audyt.

## Zakres MVP

- cztery podmioty z idempotentnego seeda: Toruń, Gdańsk, Bydgoszcz i Trade; BullHub nie jest seedowany;
- pracownicy, normalizacja telefonów E.164 i przypisania do podmiotów;
- kody QR `PERSONAL` i `GENERAL`, regeneracja tokenów oraz PNG, SVG, PDF A4 i ZIP;
- formularz mobile-first z aparatem, galerią, PDF, maksymalnie 10 stron, zmianą kolejności i notatką;
- kontrola MIME i sygnatur, limit 10 MB, 5 prób/15 min, blokada 30 min oraz 10 dokumentów/60 min;
- zapis bez nadpisywania w `Księgowość/{folder}/{rok}/{miesiąc}` według czasu `Europe/Warsaw`;
- niezależna, transakcyjna numeracja podmiotu i roku;
- statusy i append-only `DocumentEvent`;
- historia własnych zgłoszeń dla użytkownika WB Auth powiązanego z pracownikiem przez jego UUID;
- OAuth Authorization Code + PKCE z WB Auth oraz lokalne, backendowe uprawnienia domenowe i zakresy `entityId`;
- panel dokumentów, pracowników, QR, podmiotów, dostępu oraz eksport ZIP z manifestem CSV;
- wskaźnik 5 GB, ostrzeżenie od 80% i odmowa zapisu po przekroczeniu limitu.

## Uruchomienie lokalne

Wymagane są Node.js 24, PostgreSQL 17 i dostępny katalog storage.

```bash
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Można uruchomić PostgreSQL i aplikację przez `docker compose up --build`. Lokalny wolumen z `compose.yaml` służy wyłącznie do developmentu i nie jest konfiguracją produkcyjnego WhiteBull Drive.

Pierwszego administratora dodaje się po potwierdzeniu jego UUID i tenant UUID w WB Auth:

```bash
npm run bootstrap:admin -- <WB_AUTH_USER_UUID> <TENANT_UUID> <EMAIL>
```

Bootstrap nie tworzy konta ani hasła. Użytkownik musi już mieć aktywne członkostwo tenanta oraz dostęp do klienta `wb-dokumenty` w WB Auth.

## Zmienne środowiskowe

| Zmienna | Znaczenie |
| --- | --- |
| `DATABASE_URL` | PostgreSQL aplikacji WB Dokumenty |
| `APP_URL` | kanoniczny origin, produkcyjnie `https://dokumenty.whitebull.com.pl` |
| `SESSION_SECRET` | minimum 32 losowe znaki; szyfrowanie tokenów i prób OAuth |
| `HASH_SECRET` | osobny sekret HMAC dla IP i identyfikatorów klientów |
| `STORAGE_ROOT` | punkt montowania folderu `Księgowość`, nie root FileBrowsera |
| `STORAGE_LIMIT_BYTES` | logiczny limit, domyślnie `5368709120` |
| `WB_AUTH_BASE_URL`, `WB_AUTH_ISSUER` | adres i issuer WB Auth |
| `WB_AUTH_AUDIENCE` | audience podpisanego access tokenu |
| `WB_AUTH_CLIENT_ID`, `WB_AUTH_CLIENT_SECRET` | klient `wb-dokumenty`; sekret może być pusty dla klienta publicznego PKCE |
| `WB_AUTH_REDIRECT_URI` | dokładnie `https://dokumenty.whitebull.com.pl/api/auth/callback` |
| `WB_AUTH_TENANT_ID` | tenant WhiteBull wymagany przy logowaniu |
| `WB_AUTH_APPLICATION_ID` | UUID aplikacji używany przy zaproszeniach i cofnięciu dostępu |

Sekretów nie należy wprowadzać do obrazu ani repozytorium. Ustawia je Coolify podczas uruchomienia.

## Konfiguracja WB Auth

Adapter korzysta z istniejącego kontraktu WB Auth: `/api/oauth/authorize`, `/api/oauth/token`, `/api/userinfo`, EdDSA JWKS oraz centralnych zaproszeń `/api/admin/invitations/tenant-members`. Access token musi mieć `azp=WB_AUTH_CLIENT_ID`, zgodne `sub`, `sid` i `tid`. WB Auth pozostaje źródłem tożsamości, członkostwa tenanta i dostępu aplikacyjnego. WB Dokumenty przechowuje szczegółowe uprawnienia domenowe oraz podmioty.

W WB Auth należy:

1. zarejestrować aktywną aplikację i klienta `wb-dokumenty`;
2. dodać dokładny callback produkcyjny bez wildcardów;
3. nadać pierwszemu administratorowi membership i application access;
4. ustawić `WB_AUTH_TENANT_ID` i `WB_AUTH_APPLICATION_ID`;
5. upewnić się, że administrator zapraszający ma `auth.invitations.tenant-members.write` oraz role, które może delegować.

Nie ma lokalnych haseł. Cofnięcie dostępu w panelu usuwa lokalne sesje i wyłącza tenantowy application access przez API WB Auth.

## Coolify i WhiteBull Drive

1. Utwórz osobny PostgreSQL i trwały wolumen bazy. Nie montuj bazy `wb-drive` ani konfiguracji FileBrowsera.
2. Dodaj repozytorium jako aplikację Dockerfile i domenę `dokumenty.whitebull.com.pl`; wymuś HTTPS.
3. Ustaw wszystkie ENV z tabeli. Wygeneruj niezależne sekrety poleceniem narzędzia do sekretów, bez wypisywania ich do logów wdrożenia.
4. Przed montowaniem sprawdź w Coolify rzeczywisty mount usługi `wb-drive`. Potwierdź host path lub nazwany wolumen i katalog zawierający `Księgowość`.
5. Zamontuj wyłącznie właściwy fragment współdzielonego storage do ścieżki zgodnej z `STORAGE_ROOT`, z prawem zapisu UID/GID kontenera aplikacji. Nie używaj hasła administratora FileBrowsera.
6. W terminalu nowej aplikacji uruchom `npx prisma migrate deploy`, `npm run db:seed`, a następnie jednorazowy `bootstrap:admin`.
7. Dodaj pracownika, przypisz podmiot, wygeneruj testowy GENERAL QR i prześlij mały PDF.
8. Sprawdź plik na Drive, rekord i SHA-256 w panelu, następnie pobranie przez konto księgowości i zmianę statusu na `PRZYJETY`.
9. Sprawdź `/api/health` w healthchecku Coolify.

Mount produkcyjny nie jest zapisany w repozytorium, ponieważ jego nazwa i ścieżka muszą zostać potwierdzone na serwerze. Bez tego test połączenia z WhiteBull Drive pozostaje niewykonany.

## Backup i odzyskiwanie

Backup musi obejmować PostgreSQL i storage z tego samego punktu czasowego. Zalecany proces:

1. codzienny `pg_dump --format=custom` do zaszyfrowanej lokalizacji poza VPS;
2. snapshot lub `restic` katalogu `Księgowość` do drugiego dostawcy/lokalizacji;
3. retencja dzienna, tygodniowa i miesięczna zgodna z polityką księgową;
4. kwartalny restore do odizolowanej bazy i pustego katalogu;
5. uruchomienie aplikacji testowej, porównanie liczby `DocumentFile`, rozmiarów i SHA-256 z odzyskanymi plikami;
6. zapis wyniku testu restore i czasu odtworzenia.

Fizyczny limit 5 GB należy ustawić na wolumenie/host path w infrastrukturze (quota XFS/ZFS albo limit dostawcy). `STORAGE_LIMIT_BYTES` jest dodatkową ochroną aplikacyjną i nie zastępuje quota.

## Walidacja

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Testy jednostkowe obejmują seed, brak BullHub, walidację folderów i telefonów, limity, sygnatury i rozmiar uploadu, współbieżne tworzenie katalogów, brak nadpisywania, QR w wymaganych formatach, szyfrowanie tokenów, role oraz integralność schematu i migracji. Pełne testy OAuth, rzeczywistego mountu i trwałości po restarcie wymagają środowiska pilotażowego z WB Auth, PostgreSQL i `wb-drive`.

## Ograniczenia pilotażu

- numer telefonu jest deklarowaną identyfikacją, nie silnym uwierzytelnieniem;
- potwierdzenie bieżącego zgłoszenia wygasa po 24 godzinach i nie umożliwia pobrania oryginału;
- zmiana `storageFolderName` po pierwszym dokumencie jest blokowana;
- aplikacja nie usuwa dokumentów ani nie przenosi istniejących folderów;
- OCR, KSeF, AI, SMS i automatyczne księgowanie są poza MVP.
