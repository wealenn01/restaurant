# Restoran Sistemi

Bu uygulama **Docker olmadan çalışmaz**. [Docker Desktop](https://www.docker.com/products/docker-desktop/) kurulu ve açık olmalıdır.

## Kurulum

1. `bot_yapis` klasöründe **`.env.example`** dosyasını kopyalayın, adını **`.env`** yapın.
2. `.env` içinde şunları değiştirin:
   - **`DB_PASSWORD`**
   - **`JWT_SECRET`**
3. **`DB_HOST=db`** satırını değiştirmeyin.

## Başlatma / durdurma

| Dosya | İşlev |
|--------|--------|
| **`Baslat.bat`** | Sistemi başlatır → http://127.0.0.1 |
| **`Durdur.bat`** | Durdurur (veri kalır) |
| **`VeritabaniSifirla.bat`** | Tüm veriyi siler → sonra tekrar `Baslat.bat` |

Docker’ı açın, ardından **`Baslat.bat`** çalıştırın. İlk kayıt admin olur.
