# Inventario Simple — 3 contenedores (Frontend, Backend, Base de Datos)

Este documento describe **cómo se configuraron los contenedores**, **cómo interactúan entre sí** y los **puntos clave** para operar y mantener el proyecto. Está pensado para ser tu **README** del laboratorio.

---

## 1) Arquitectura general

Tres servicios aislados en contenedores, orquestados con **Docker Compose**:

```
[ Navegador ] → (HTTP 8080) → [ Frontend (Nginx) ]
                         ↓ (HTTP 3000, JSON/REST)
                  [ Backend (Node/Express) ] → (TCP 5432 interno)
                                         [ PostgreSQL ]
```

- **Frontend (Nginx):** sirve una SPA/HTML estático que consume la API.
- **Backend (Express):** expone endpoints REST `/api/products` y se conecta a Postgres.
- **DB (PostgreSQL):** almacena los productos del inventario; se inicializa con `init.sql`.

Todos los contenedores comparten una **red virtual de Docker** creada por Compose; dentro de esa red, el backend accede a la DB por **hostname `db`** (service discovery).

---

## 2) Estructura del proyecto

```
inventario-simple/
├─ docker-compose.yml
├─ db/
│  └─ init.sql
├─ backend/
│  ├─ Dockerfile
│  ├─ package.json
│  ├─ server.js
│  └─ .dockerignore
└─ frontend/
   ├─ Dockerfile
   └─ public/
      └─ index.html
```

- `docker-compose.yml`: definición de los 3 servicios y sus dependencias.
- `db/init.sql`: crea la tabla `products` y carga datos iniciales.
- `backend/`: API Node/Express y su Dockerfile.
- `frontend/`: Nginx para servir `index.html` + JS simple.

> **Nota Compose v2:** La clave `version:` es obsoleta; se eliminó para evitar warnings.

---

## 3) docker-compose.yml (explicado)

### Servicios

- **db (PostgreSQL 16)**
  - Imagen `postgres:16`
  - Variables:
    - `POSTGRES_DB=inventory`
    - `POSTGRES_USER=inventory_user`
    - `POSTGRES_PASSWORD=inventory_pass`
  - Puertos: `5433:5432` (mapeo host:contenedor) → se usa **5433 en el host** para no chocar con un Postgres local que use 5432.
  - Volúmenes:
    - `db_data:/var/lib/postgresql/data` (persistencia de datos)
    - `./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro` (seed al primer arranque del volumen)
  - **Healthcheck:** `pg_isready` para que otros servicios esperen hasta que la DB esté lista.

- **backend (Node 20 + Express)**
  - `build: ./backend` (usa el Dockerfile del backend).
  - Variables:
    - `DATABASE_URL=postgresql://inventory_user:inventory_pass@db:5432/inventory`
      - **Host `db`** es el nombre del servicio; **5432** es el puerto **interno** del contenedor DB.
    - `PORT=3000`
    - `CORS_ORIGIN=http://localhost:8080`
  - `depends_on: db: condition: service_healthy` para arrancar cuando Postgres esté sano.
  - Puertos: `3000:3000` (exponemos la API hacia el host).

- **frontend (Nginx)**
  - `build: ./frontend` (Dockerfile simple que copia `public/` a Nginx).
  - Puertos: `8080:80` (sirve la UI).

### Red y resolución de nombres

Compose crea una **red por proyecto**. Todos los servicios están en esa red, por lo que **`db`**, **`backend`** y **`frontend`** se pueden encontrar por nombre. El backend usa `db:5432` en su `DATABASE_URL`.

### Volúmenes

- `db_data` guarda los datos de Postgres **persistentes**. Un `down -v` los elimina.

---

## 4) Contenedor de Base de Datos (PostgreSQL)

**Arranque e inicialización:** La imagen oficial ejecuta cualquier `*.sql` en `/docker-entrypoint-initdb.d/` **solo la primera vez** que se crea el volumen de datos. Por eso:
- Si cambias `init.sql` pero ya existe el volumen `db_data`, **no se re-ejecuta** automáticamente.
- Para forzar re-seed: `docker compose down -v && docker compose up -d --build`.

**Healthcheck:** Se usa `pg_isready` para confirmar que la DB acepta conexiones antes de levantar el backend. Esto evita errores de “connection refused” al inicio.

**Puertos:** Mapeamos `5433:5432` para no interferir con instalaciones locales de Postgres.

---

## 5) Contenedor Backend (Node/Express)

**Dockerfile (resumen):**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Opción A rápida:
RUN npm install --omit=dev
# Opción B (recomendada): si existe package-lock.json
# RUN npm ci --omit=dev
COPY server.js ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

**.dockerignore (clave para builds rápidas):**
```
node_modules
npm-debug.log
logs
*.log
.env
.vscode
.idea
```

**Conexión a la DB:** El backend usa `pg` y la `DATABASE_URL` con host `db`. Dentro de la red de Compose no se usa `localhost` para la DB.

**CORS:** Se habilita con `cors` para permitir peticiones del frontend (`http://localhost:8080`). Si cambias el puerto del frontend, **actualiza** `CORS_ORIGIN`.

**Endpoints principales:**
- `GET /health` → chequeo rápido de estado del backend/DB.
- `GET /api/products` → listar productos.
- `POST /api/products` → crear.
- `PUT /api/products/:id` → actualizar.
- `DELETE /api/products/:id` → eliminar.

---

## 6) Contenedor Frontend (Nginx)

**Dockerfile:**

```dockerfile
FROM nginx:alpine
COPY public /usr/share/nginx/html
```

**`public/index.html`:** HTML+JS que consume `http://localhost:3000/api/products` desde el navegador del **host**. Por eso el backend se publica con `3000:3000`.

> **Alternativa (producción):** Configurar Nginx como **reverse proxy** y servir la API en la misma URL de frontend (evitas CORS).

---

## 7) Flujo de interacción (end-to-end)

1. El usuario abre `http://localhost:8080` → Nginx sirve `index.html`.
2. El JS del frontend realiza `fetch` a `http://localhost:3000/api/products`.
3. El backend (Express) procesa la petición y consulta a Postgres usando `db:5432`.
4. Postgres responde al backend; el backend devuelve JSON al navegador.
5. El frontend renderiza la tabla con los productos.

**Diagrama de secuencia (simplificado):**

```
Browser --> Frontend(Nginx): GET /
Browser --> Backend(Express): GET /api/products
Backend --> DB(Postgres): SELECT * FROM products
DB --> Backend: rows
Backend --> Browser: JSON
```

---

## 8) Operación y ciclo de vida

- **Levantar / reconstruir:**
  ```bash
  docker compose up -d --build
  ```
- **Estado:**
  ```bash
  docker compose ps
  ```
- **Logs:**
  ```bash
  docker logs inventory_api --tail 100
  docker logs inventory_db --tail 100
  docker logs inventory_frontend --tail 100
  ```
- **Detener temporalmente:**
  ```bash
  docker compose stop
  ```
- **Apagar y borrar contenedores/red (conservar datos):**
  ```bash
  docker compose down
  ```
- **Reset total (borrar datos de la DB):**
  ```bash
  docker compose down -v
  ```

---

## 9) Pruebas rápidas

**Backend (salud y datos):**
```bash
# Health
curl http://localhost:3000/health

# Listado
curl http://localhost:3000/api/products

# Crear (PowerShell)
Invoke-RestMethod -Uri "http://localhost:3000/api/products" -Method POST -ContentType "application/json" -Body '{"name":"Laptop","price":3299.90,"quantity":3}'
```

**DB dentro del contenedor:**
```bash
docker exec -it inventory_db psql -U inventory_user -d inventory -c "SELECT id,name,price,quantity FROM products;"
```

---

## 10) Decisiones técnicas y buenas prácticas

- **Aislamiento por servicio:** cada contenedor tiene una responsabilidad clara (UI, API, datos).
- **Service discovery interno:** el backend usa `db` como hostname gracias a la red de Compose.
- **Persistencia con volúmenes:** `db_data` evita perder datos al hacer `down`.
- **Inicialización declarativa:** `init.sql` garantiza una base mínima reproducible.
- **Healthcheck en DB:** el backend espera a que la DB esté lista.
- **CORS controlado:** se limita el origen del frontend (puerto 8080).
- **.dockerignore:** acelera builds y evita inconsistencias con `node_modules` del host.
- **Puertos sin conflicto:** mapeo `5433:5432` previene choques con Postgres local.

**Mejoras futuras:** añadir healthcheck al backend, variables en `.env` + `env_file`, Nginx como reverse-proxy, usuarios no root en contenedores, CI/CD, tests de integración y migraciones con herramientas tipo `knex`/`prisma`/`sequelize` en vez de SQL suelto.

---

## 11) Enlaces y referencias del proyecto

- **Frontend (Nginx + HTML/JS):** `[coloca aquí tu URL de repositorio]`
- **Backend (Node/Express):** `[coloca aquí tu URL de repositorio]`
- **Infra/Compose:** `[coloca aquí tu URL de repositorio]`

*(Reemplaza los placeholders con tus enlaces antes de entregar.)*

---

## 12) Troubleshooting (rápido)

- **`npm ci` falla sin `package-lock.json`:** usa `npm install --omit=dev` o crea el lockfile y vuelve a `npm ci`.
- **CORS desde el navegador:** revisa `CORS_ORIGIN` y el puerto real del frontend.
- **DB no “healthy”:** mira logs `docker logs inventory_db`, prueba `pg_isready` y `psql`. Aumenta `retries` si tu máquina es lenta.
- **Cambiaste `init.sql` y no se ve:** recrea volumen con `docker compose down -v` (⚠️ borra datos).