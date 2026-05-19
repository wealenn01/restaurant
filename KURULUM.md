# Restoran Sistemi — Kurulum (Windows + Docker)

## Gereksinimler

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) kurulu ve çalışıyor olmalı.
2. Bu klasörün tamamı bilgisayarda bir yerde durmalı (ör. `C:\RestoranSistemi`).

## İlk kurulum (müşteri)

1. `bot_yapis` klasöründe `.env.example` dosyasını kopyalayın, adını **`.env`** yapın.
2. `.env` içinde mutlaka değiştirin:
   - `DB_PASSWORD` — güçlü bir şifre
   - `JWT_SECRET` — uzun rastgele bir anahtar
3. **`DB_HOST=db` satırını değiştirmeyin** (Docker için gerekli).
4. Docker Desktop’ı açın.
5. **`Baslat.bat`** dosyasına çift tıklayın.
6. Tarayıcıda **http://127.0.0.1** açılır (açılmazsa adresi elle yazın).
7. **Kayıt ol** ile ilk hesabı oluşturun.

### İlk kayıt = admin

- Veritabanında **hiç admin yoksa** kayıt olan kullanıcı **admin** (yönetim paneli) olur.
- Sonraki kayıtlar **garson (staff)** olur.
- Müşteri paketinde veritabanı **boştur**; ilk gerçek kayıt restoran sahibidir.

## Günlük kullanım

| Dosya | İşlev |
|--------|--------|
| `Baslat.bat` | Sistemi başlatır, tarayıcıyı açar |
| `Durdur.bat` | Konteynerleri durdurur (veri kalır) |

## Veritabanını sıfırlama (dikkat)

**`VeritabaniSifirla.bat`** — tüm sipariş ve kullanıcı verisini siler, tablolar yeniden oluşur.

- Sadece **fabrika ayarı** / yeni kurulum için kullanın.
- `docker compose down -v` komutunun kısayoludur.
- Sonrasında **`Baslat.bat`** ile tekrar başlatın ve **yeniden kayıt** olun.

## Sorun giderme

- **"bot_yapis\.env yok"** → `.env.example` → `.env` kopyalayın.
- **Sayfa açılmıyor** → Docker çalışıyor mu? `http://127.0.0.1` deneyin. 15 sn bekleyip F5.
- **Port 80 dolu** → IIS / Skype kapatın veya destek alın.
- **Garson ekranına düştüm, admin olmalıydım** → Zaten bir admin hesabı var; doğru admin ile giriş yapın veya (veri önemsizse) `VeritabaniSifirla.bat` + yeni kayıt.
- **Loglar** → `docker compose --env-file bot_yapis\.env logs -f`

## Paket hazırlayan (geliştirici)

Müşteriye göndermeden önce:

1. `frontend` içinde `npm run build` ( `VITE_API_URL=/api` — `frontend/.env.production` )
2. ZIP’e **`node_modules`**, **`.git`**, **`bot_yapis/.env`** koymayın
3. Docker volume (`pgdata`) pakette olmaz; müşteride ilk `Baslat` ile boş DB oluşur
4. Kendi test kullanıcılarınızı pakete bırakmayın; demo öncesi `VeritabaniSifirla.bat`
