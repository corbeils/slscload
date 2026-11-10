# Déploiement sur la VPS (Docker, mise à jour automatique depuis GitHub)

Chaque push sur `main` : GitHub Actions construit l'image `ghcr.io/corbeils/slscload:latest`, puis Watchtower, sur la VPS, la tire et redémarre le conteneur (délai d'environ 1 à 3 minutes).

## 1. Une seule fois : accès à l'image privée
Si le dépôt est privé, l'image GHCR l'est aussi.
1. GitHub → Settings → Developer settings → Personal access tokens (classic) → créer un jeton avec la seule permission `read:packages`.
2. Sur la VPS : `echo <JETON> | docker login ghcr.io -u corbeils --password-stdin` (crée `~/.docker/config.json`, monté dans Watchtower).
   Ajuste le chemin dans `docker-compose.yml` si tu n'es pas root.

## 2. Une seule fois : démarrer
```
mkdir -p /opt/slscload && cd /opt/slscload
# copier docker-compose.yml, puis créer .env :
printf 'ADMIN_USER=steve\nADMIN_PASSWORD=mot-de-passe-solide\n' > .env
docker compose up -d
```
L'administrateur est créé au premier démarrage. Pour les autres personnes :
```
docker compose exec app node server/users.js add jean "mot-de-passe"          # planificateur / chargeur
docker compose exec app node server/users.js add marie "mot-de-passe" admin   # administrateur
```
Le rôle (planificateur, chargeur) se donne ensuite dans la page : Admin → Utilisateurs.

## 3. HTTPS
Le conteneur écoute sur `127.0.0.1:3000`. Mets un proxy HTTPS devant. Exemple Caddy :
```
planif.ton-domaine.ca {
  reverse_proxy 127.0.0.1:3000
}
```
Le proxy doit transmettre `X-Forwarded-Proto` (Caddy et nginx le font) pour que le cookie soit marqué `Secure`.

## 4. Sauvegardes
Les données (équipements, attaches, projets, rôles, utilisateurs) sont dans le volume `slscload-data` (`/data` dans le conteneur) : `store.json`, `users.json`, `secret`.
```
docker run --rm -v slscload_slscload-data:/d -v $PWD:/b alpine tar czf /b/slscload-data.tgz -C /d .
```

## Variante sans registre (SSH)
À la place de GHCR et Watchtower : une Action qui se connecte en SSH à la VPS et lance `git pull && docker compose up -d --build`. Plus simple à comprendre, mais la construction se fait sur la VPS.

## Limites actuelles
- Les données sont dans des fichiers JSON : suffisant pour quelques utilisateurs, pas pour de gros volumes. Le schéma PostgreSQL/Drizzle du projet pourra le remplacer.
- Le rôle « chargeur » est appliqué dans l'interface seulement ; côté serveur, seules les écritures sur équipements, attaches et rôles sont réservées aux administrateurs.
- La vue chargeur partageable est un fichier .html téléchargé ; il n'y a pas encore de lien public par chargement.
