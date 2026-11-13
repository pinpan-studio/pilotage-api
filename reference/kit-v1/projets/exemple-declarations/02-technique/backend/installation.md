# Installation — backend

```bash
composer install
cp .env.example .env && php artisan key:generate
php artisan migrate --seed
php artisan serve
```

Variables d'environnement principales : `DB_*`, `MAIL_*`, `FILESYSTEM_DISK`, `PIECES_TAILLE_MAX_MO`.
