# IDM admin deployment guide

Документ предназначен для администратора Avanpost IDM и интегратора, который
настраивает один idmMw middleware endpoint для многих целевых систем.
Разработка новых коннекторов описана отдельно в
[CONNECTOR_TEMPLATE.md](CONNECTOR_TEMPLATE.md) и
[CUSTOM_CONNECTOR_DEPLOYMENT.md](CUSTOM_CONNECTOR_DEPLOYMENT.md).

## Назначение

idmMw принимает события Avanpost IDM на одном endpoint:

```text
POST /webhooks/avanpost
```

Один запрос адресован одной целевой системе. Для работы с несколькими
системами IDM отправляет несколько запросов в тот же endpoint и меняет только
`targetSystem`. Значение `targetSystem` должно совпадать с `TargetSystem.name`
в idmMw.

Пример:

| IDM operation                            | Target system in idmMw            | `targetSystem` в webhook |
| ---------------------------------------- | --------------------------------- | ------------------------ |
| Создать пользователя в Zabbix prod       | `TargetSystem.name=zabbix-prod`   | `zabbix-prod`            |
| Создать того же пользователя в HR portal | `TargetSystem.name=portal-hr`     | `portal-hr`              |
| Проверить CMDBuild prod                  | `TargetSystem.name=cmdbuild-prod` | `cmdbuild-prod`          |

## Что настраивается в idmMw и в IDM

Сначала настройте целевые системы в idmMw, затем настройте Avanpost IDM на
вызов idmMw.

| Где                  | Что настраивается                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| idmMw Admin UI/API   | `TargetSystem`: имя, тип коннектора, URL/секреты/TLS/retryPolicy конкретной целевой системы               |
| Avanpost IDM         | REST/webhook action на `POST /webhooks/avanpost`, JSON body, mapping IDM-полей в `operation` и `payload` |
| Сетевой периметр/TLS | HTTPS, mTLS, allowlist, reverse proxy или gateway auth для IDM-facing endpoints                           |

IDM не должен вызывать `/admin/*`: это административный API idmMw. Для IDM
предназначены только `/webhooks/avanpost` и read facade `/idm/*`.

## Создание TargetSystem

Создайте отдельную запись `TargetSystem` для каждой управляемой системы.

Admin UI:

```text
http://localhost:3010/ -> Target Systems -> Create
```

Admin API:

```bash
curl -X POST http://localhost:3010/admin/target-systems \
  -H "Content-Type: application/json" \
  -d '{
    "name": "zabbix-prod",
    "type": "zabbix",
    "label": "Zabbix Production",
    "config": {
      "baseUrl": "https://zabbix.example.local",
      "apiToken": "REPLACE_WITH_SECRET",
      "timeout": 15000,
      "retryPolicy": {
        "maxRetries": 5,
        "baseDelayMs": 1000,
        "maxDelayMs": 30000,
        "dlqLeaseSeconds": 600,
        "jitter": true
      },
      "tls": {
        "enabled": true,
        "caPath": "/etc/idmmw/tls/zabbix-ca.crt",
        "certPath": "/etc/idmmw/tls/idmmw-client.crt",
        "keyPath": "/etc/idmmw/tls/idmmw-client.key",
        "serverName": "zabbix.example.local",
        "rejectUnauthorized": true
      }
    },
    "enabled": true
  }'
```

Правила:

- `name` - стабильный routing key для IDM; именно это значение указывается в
  `targetSystem`.
- `type` - тип коннектора (`zabbix`, `cmdbuild`, `rest`, `db`, `fake` или
  другой зарегистрированный connector type).
- `config` хранит параметры конкретного инстанса целевой системы.
- После create/update/delete idmMw автоматически перезагружает registry;
  перезапуск приложения для изменения `TargetSystem.config` не нужен.

Если `ADMIN_AUTH_ENABLED=true`, все `/admin/*` endpoints требуют admin session.
State-changing запросы (`POST`, `PATCH`, `DELETE`) должны передавать
`X-CSRF-Token` из `/auth/session` или ответа login.

## Настройка в Avanpost IDM

В Avanpost IDM создайте HTTP REST/webhook action или шаг бизнес-процесса,
который отправляет provisioning event в idmMw. Названия экранов в IDM зависят от
версии и роли пользователя, но параметры вызова должны быть следующими:

```text
Method: POST
URL: https://<idmmw-host>:3010/webhooks/avanpost
Content-Type: application/json
Timeout: 30s или меньше, по эксплуатационному стандарту
Retry in IDM: выключить или ограничить, если retry/DLQ обрабатывает idmMw
```

Обязательные headers:

```text
Content-Type: application/json
```

Опциональные headers добавляются только если перед idmMw стоит reverse proxy,
gateway или mTLS termination, например:

```text
Authorization: Bearer <gateway-token>
X-Request-Source: avanpost-idm
```

Admin UI auth к этому endpoint не применяется. Не передавайте admin session или
`X-CSRF-Token` из idmMw в IDM webhook.

### Mapping полей IDM в webhook body

Настройте JSON body в IDM так, чтобы каждое событие формировало следующие поля:

| Поле webhook             | Источник в IDM                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `eventId`                | Уникальный ID заявки/процесса/операции + `targetSystem`, например `request-123:zabbix-prod`      |
| `operation`              | Код операции IDM, например `user.create`, `user.update`, `group.addMember`, `system.test`        |
| `targetSystem`           | Строка, равная `TargetSystem.name` в idmMw                                                       |
| `payload.data`           | Изменяемые атрибуты пользователя/группы: username, email, groups, password, attributes и т.п.    |
| `payload.params`         | Идентификаторы и фильтры для read/test операций: `id`, `filter`, `limit`, `groupId`, `userId`    |
| `payload.metadata`       | Опциональный контекст: requestId, initiator, approvalId, sourceProcess                           |

Минимальный шаблон body для write operation:

```json
{
  "eventId": "{{requestId}}:zabbix-prod",
  "operation": "user.create",
  "targetSystem": "zabbix-prod",
  "payload": {
    "data": {
      "username": "{{user.login}}",
      "email": "{{user.email}}",
      "firstName": "{{user.firstName}}",
      "lastName": "{{user.lastName}}",
      "groups": ["monitoring-users"]
    },
    "metadata": {
      "requestId": "{{requestId}}",
      "source": "avanpost-idm"
    }
  }
}
```

Минимальный шаблон body для read operation через webhook:

```json
{
  "eventId": "{{requestId}}:zabbix-prod:read",
  "operation": "user.get",
  "targetSystem": "zabbix-prod",
  "payload": {
    "params": {
      "id": "{{user.externalId}}"
    }
  }
}
```

Если одно бизнес-событие должно уйти в несколько целевых систем, настройте в IDM
несколько HTTP actions или несколько шагов процесса. Endpoint остаётся тем же,
но `targetSystem` и `eventId` должны отличаться:

```text
request-123:zabbix-prod  -> targetSystem=zabbix-prod
request-123:portal-hr    -> targetSystem=portal-hr
```

Основные правила mapping:

- `targetSystem = TargetSystem.name` в idmMw.
- `eventId = бизнес-событие + targetSystem`.
- Для одного бизнес-события и нескольких целевых систем используйте разные
  `eventId`, например `idm-1001:zabbix-prod` и `idm-1001:portal-hr`.
- `operation` должен быть одним из поддерживаемых IDM operations.
- Данные изменения передавайте в `payload.data`.
- Query/path-like параметры read operations передавайте в `payload.params`, если
  используете прямой webhook read call. IDM-facing facade `/idm/*` заполняет
  `params` автоматически из route/query параметров.
- Не передавайте параметры подключения к целевой системе из IDM. URL, API keys,
  TLS и retryPolicy хранятся в `TargetSystem.config` в idmMw.

Поддерживаемые operations:

```text
user.create, user.update, user.delete, user.get, user.search,
user.enable, user.disable, user.lock, user.unlock, user.changePassword,
user.resolve, user.addAttributes, user.removeAttributes,
group.create, group.update, group.delete, group.get, group.search,
group.addMember, group.removeMember,
system.test, schema.get, sync.full, sync.incremental
```

## Payload examples

Write operation:

```json
{
  "eventId": "idm-1001:zabbix-prod",
  "operation": "user.create",
  "targetSystem": "zabbix-prod",
  "payload": {
    "data": {
      "username": "ivanov",
      "email": "ivanov@example.local",
      "firstName": "Ivan",
      "lastName": "Ivanov",
      "groups": ["monitoring-users"]
    }
  }
}
```

Read operation through webhook:

```json
{
  "eventId": "idm-read-1001:zabbix-prod",
  "operation": "user.get",
  "targetSystem": "zabbix-prod",
  "payload": {
    "params": {
      "id": "user-1001"
    }
  }
}
```

Read operation through IDM facade:

```bash
curl -s http://localhost:3010/idm/zabbix-prod/users/user-1001 | jq .
curl -s "http://localhost:3010/idm/zabbix-prod/users?filter=ivanov&limit=10" | jq .
curl -s http://localhost:3010/idm/zabbix-prod/schema | jq .
curl -s -X POST http://localhost:3010/idm/zabbix-prod/sync \
  -H "Content-Type: application/json" \
  -d '{"mode":"incremental"}' | jq .
```

Response semantics:

| Тип операции                                                       | Поведение                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Write (`user.create`, `group.addMember`, ...)                      | Возвращает `received=true`, `processed=true`, без `data`. При сбое после retry событие попадает в DLQ.                    |
| Read/test/sync (`user.get`, `system.test`, `schema.get`, `sync.*`) | Возвращает `received=true`, `processed=true`, `data` с ответом целевой системы. При ошибке возвращает HTTP error без DLQ. |
| Duplicate `eventId`                                                | Возвращает `received=true`, `processed=false`; вызов целевой системы не выполняется.                                      |

## Проверка настройки

Администраторский checklist:

1. Создать `TargetSystem` в idmMw Admin UI/API.
2. Проверить, что система включена и видна в `GET /idm/target-systems`.
3. Проверить связь через `GET /idm/<targetSystem>/test`.
4. Настроить REST/webhook action в Avanpost IDM на
   `POST /webhooks/avanpost`.
5. Отправить тестовое write-событие из IDM или через Mock IDM.
6. Проверить HTTP response, structured logs, `/metrics` и DLQ в Admin UI.
7. Для production включить HTTPS/mTLS или gateway controls по политике
   эксплуатации.

Проверить каталог систем, видимый для IDM:

```bash
curl -s http://localhost:3010/idm/target-systems | jq .
curl -s http://localhost:3010/idm/target-systems/zabbix-prod | jq .
```

Каталог содержит только enabled `TargetSystem`, доступные через
`ConnectorRegistry`. Ответ не возвращает `config`, токены, пароли и другие
секреты.

Проверить связь с конкретной системой:

```bash
curl -s http://localhost:3010/idm/zabbix-prod/test | jq .
curl -s -X POST http://localhost:3010/admin/target-systems/<id>/test | jq .
```

Проверить webhook через Mock IDM в dev/test:

```bash
curl -X POST http://localhost:3010/mock-idm/scenario/user-create
curl -X POST http://localhost:3010/mock-idm/scenario/user-update
curl -X POST http://localhost:3010/mock-idm/scenario/user-delete
curl -X POST http://localhost:3010/mock-idm/scenario/duplicate
curl -X POST http://localhost:3010/mock-idm/scenario/fail
```

Для точного payload используйте:

```bash
curl -X POST http://localhost:3010/mock-idm/send-event \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "manual-1001:fake",
    "operation": "user.create",
    "targetSystem": "fake",
    "payload": { "data": { "username": "manual-user" } }
  }'
```

Проверить production-like webhook напрямую без Mock IDM:

```bash
curl -X POST https://<idmmw-host>:3010/webhooks/avanpost \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "manual-1001:zabbix-prod",
    "operation": "user.create",
    "targetSystem": "zabbix-prod",
    "payload": {
      "data": {
        "username": "manual-user",
        "email": "manual-user@example.local"
      }
    }
  }'
```

Ожидаемый успешный ответ для write operation:

```json
{
  "received": true,
  "processed": true
}
```

## TLS and auth

Inbound TLS включается для общего HTTP listener:

```env
HTTP_TLS_ENABLED=true
HTTP_TLS_CERT_PATH=/etc/idmmw/tls/server.crt
HTTP_TLS_KEY_PATH=/etc/idmmw/tls/server.key
HTTP_TLS_CA_PATH=/etc/idmmw/tls/client-ca.crt
HTTP_TLS_REJECT_UNAUTHORIZED=true
```

После включения TLS IDM должен вызывать `https://<idmmw-host>:3010`.

Важно:

- `ADMIN_AUTH_ENABLED` защищает `/admin/*` и Admin UI session endpoints.
- Admin auth не применяется к `/webhooks/avanpost`, `/idm/*`, `/health` и
  `/metrics`.
- Для `/webhooks/avanpost` и `/idm/*` используйте сетевой периметр, TLS/mTLS,
  reverse proxy или отдельный gateway auth, если это требуется политикой
  эксплуатации.
- TLS для исходящих соединений к целевым системам задаётся в
  `TargetSystem.config.tls`.

Полный security runbook:
[SECURITY_TLS_ENCRYPTION.md](SECURITY_TLS_ENCRYPTION.md).

## Troubleshooting

| Симптом                                                   | Возможная причина                                                                                     | Проверка и действие                                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation must be one of...` или HTTP 400                | IDM отправил неизвестный `operation`                                                                  | Сверьте operation со списком выше и enum Avanpost IDM. Для Mock IDM используйте route name в формате operation kebab-case, например `user-create`. |
| `Unsupported target system` или `Target system not found` | `targetSystem` не совпадает с enabled `TargetSystem.name` или connector registry не содержит этот тип | Проверьте `GET /idm/target-systems`, `GET /admin/target-systems` и поле `enabled`.                                                                 |
| `received=true`, `processed=false`                        | Повторный `eventId`                                                                                   | Для нескольких целевых систем формируйте `eventId` как business event + target system.                                                             |
| DLQ растёт                                                | Целевая система недоступна, неверный config, timeout или connector error                              | Проверьте `/metrics`, Admin UI DLQ, structured logs и `POST /admin/target-systems/<id>/test`.                                                      |
| Read operation возвращает HTTP error                      | Read/test/sync не идут в DLQ и возвращают ошибку сразу                                                | Проверьте target system config и повторите `/idm/:targetSystem/test`.                                                                              |
| TLS handshake error                                       | Неверные `HTTP_TLS_*` или `config.tls` certificates/serverName                                        | Проверьте paths, CA chain, `serverName`, `rejectUnauthorized` и используемый `https://` URL.                                                       |
