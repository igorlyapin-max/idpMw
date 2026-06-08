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

| Где                  | Что настраивается                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| idmMw Admin UI/API   | `TargetSystem`: имя, тип коннектора, URL/секреты/TLS/retryPolicy конкретной целевой системы                                                    |
| Avanpost IDM         | Ресурс и профили в `Интеграции -> Целевые системы`, скрипт обращения к сервису, блок БП или обработчик события, который вызывает idmMw webhook |
| Сетевой периметр/TLS | HTTPS, mTLS, allowlist, reverse proxy или gateway auth для IDM-facing endpoints                                                                |

Сверка выполнена по официальной документации Avanpost IDM 7.8:

- [6.1.4. Настройка интеграции с целевыми системами](https://docs.avanpost.ru/idm/7.8/162170977.html)
- [6.1.6. Настройка сервисов коннекторов](https://docs.avanpost.ru/idm/7.8/162170999.html)
- [6.1.10. Настройка бизнес-процессов](https://docs.avanpost.ru/idm/7.8/162171206.html)
- [6.1.12. Обработка событий](https://docs.avanpost.ru/idm/7.8/162171315.html)

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

В документации Avanpost IDM 7.8 не описан отдельный универсальный экран
`REST webhook action`. Для idmMw используйте один из двух поддерживаемых
паттернов:

- Рекомендуемый для idmMw: в Avanpost IDM ресурс, событие или бизнес-процесс
  вызывает скрипт обращения к внешнему сервису, а скрипт отправляет
  `POST /webhooks/avanpost`.
- Native connector pattern Avanpost: коннектор реализуется как библиотека
  Avanpost и настраивается через `Интеграции -> Сервисы коннекторов` и
  `Интеграции -> Целевые системы`. Этот путь нужен, если idmMw заменяется
  native-коннектором Avanpost, а не вызывается как внешний middleware.

### 1. Интеграции -> Целевые системы

В Avanpost IDM перейдите в раздел:

```text
Интеграции -> Целевые системы
```

В этом разделе создаются ресурсы, каталоги ресурсов, профили, периоды
недоступности, почтовые уведомления и фильтры событий аудита. Для idmMw ресурс
нужен как IDM-модель управляемой системы и источник контекста для заявок,
ролей, учётных записей и событий.

Создайте ресурс:

1. В разделе `Целевые системы` нажмите кнопку добавления.
2. Выберите `Ресурс`.
3. Укажите человекочитаемое название ресурса, например `Zabbix Production`.
4. Сохраните ресурс.

На вкладке `Атрибуты ресурса` заполните блоки так:

| Атрибут Avanpost IDM     | Как заполнять для idmMw                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `Каталог`                | Каталог в иерархии IDM. На routing idmMw не влияет.                                                                               |
| `Название`               | Человекочитаемое имя ресурса в IDM. Рекомендуется держать рядом с `TargetSystem.name`, например `zabbix-prod` или `Zabbix prod`.  |
| `Библиотека коннекторов` | Для native connector flow выберите библиотеку Avanpost connector. Для idmMw webhook flow это поле не хранит настройки idmMw.      |
| `Строка подключения`     | Для native connector flow хранит connection string Avanpost connector. Для idmMw не переносите сюда API keys/TLS целевой системы. |
| `Ресурс включен`         | Должен быть включён, если заявки и события IDM должны использовать ресурс.                                                        |

Настройки подключения к фактической системе, например `baseUrl`, `apiToken`,
`tls` и `retryPolicy`, хранятся в `TargetSystem.config` в idmMw. Не дублируйте
эти секреты в Avanpost IDM, если выбран idmMw webhook flow.

Проверьте связанные вкладки ресурса:

| Вкладка / блок Avanpost IDM | Что проверить для idmMw                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Свойства`                  | Дополнительные атрибуты ресурса, если они нужны для заявок, политик или скриптов. В webhook передавайте их только как business metadata.    |
| `Права`                     | Глобальные и объектные права, которые Avanpost IDM использует в ролях и заявках. Значения мапятся в `payload.data.groups` или attributes.   |
| `Периоды недоступности`     | Окна, когда IDM считает ресурс недоступным. Если они используются, не запускайте provisioning в эти окна или явно обрабатывайте паузу в БП. |
| `Учётные записи`            | Список УЗ ресурса после загрузки данных в IDM. Для live-проверки целевой системы используйте idmMw `/idm/:targetSystem/*`.                  |
| `Очередь`                   | Очередь запросов к ресурсу в IDM. Для idmMw дополнительно проверяйте structured logs, `/metrics` и DLQ в Admin UI.                          |

Настройте профили ресурса в том же разделе:

```text
Интеграции -> Целевые системы -> <ресурс> -> Добавить профиль
```

Для `Общий профиль` используйте кнопку добавления в разделе `Целевые системы` и
выберите `Общий профиль`. Для профиля конкретного ресурса выберите действие
`Добавить профиль` в строке ресурса. На профиле заполните:

| Блок профиля Avanpost IDM      | Что важно для idmMw                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `Название`                     | Человекочитаемое имя профиля.                                                                                                 |
| `Шаблон учетных записей`       | Правила имени УЗ и атрибутов. Эти значения должны попасть в `payload.data.username`, `email`, `attributes`.                   |
| `Зависимости учетных записей`  | Используйте, если УЗ в одной системе зависит от УЗ в другой. Для idmMw это обычно несколько webhook с разными `targetSystem`. |
| Тип создаваемой учётной записи | Используйте как metadata или как признак для выбора `operation`, если это нужно в БП.                                         |

Правило routing остаётся на стороне idmMw:

```text
Avanpost resource/profile context -> webhook.targetSystem = TargetSystem.name
```

Например, ресурс IDM `Zabbix Production` должен отправлять
`"targetSystem": "zabbix-prod"`, если в idmMw создан
`TargetSystem.name=zabbix-prod`.

### 2. Интеграции -> Сервисы коннекторов

Раздел:

```text
Интеграции -> Сервисы коннекторов
```

используется Avanpost IDM для native connector libraries и удалённых сервисов
коннекторов. В документации Avanpost connector - это библиотека, исполняемая
локально на сервере IDM или на удалённом сервисе коннекторов.

Для idmMw webhook flow этот раздел обычно не нужен: idmMw уже является внешним
middleware и сам маршрутизирует события в целевые системы. Используйте этот
раздел только если в вашей инсталляции требуется native-коннектор Avanpost,
который будет вызывать idmMw или заменять его.

Если native connector flow всё же выбран, настройте:

1. `Интеграции -> Сервисы коннекторов`.
2. При необходимости создайте пул сервисов коннекторов.
3. Добавьте сервис коннекторов без пула или через действие `Добавить сервис` в
   строке пула.
4. В форме сервиса заполните:

| Атрибут сервиса Avanpost IDM | Значение                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Наименование`               | Произвольное имя сервиса.                                                                                      |
| `Режим подключения`          | `прямой`, если IDM подключается к сервису коннекторов; `обратный`, если сервис коннекторов подключается к IDM. |
| `Адрес сервиса`              | URL сервиса коннекторов. Это не URL `POST /webhooks/avanpost`, если idmMw используется как внешний middleware. |
| Вкладка `Сертификат`         | Сгенерируйте или импортируйте сертификат сервиса коннекторов, если используется удалённый connector service.   |

### 3. Настройка процессов -> Скрипты

Для рекомендуемого idmMw flow создайте скрипт, который формирует JSON body и
выполняет HTTP POST в idmMw. В официальных блоках бизнес-процесса поле
`Функция обращения к сервису` выбирает скрипт из:

```text
Настройка процессов -> Скрипты
```

Минимальные параметры HTTP-вызова:

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

### 4. Настройка процессов -> Бизнес-процессы

Раздел:

```text
Настройка процессов -> Бизнес-процессы
```

используется, если webhook должен выполняться как часть заявки, согласования или
другого маршрута. В редакторе БП добавьте блоки и связи через механизм
Drag-and-Drop.

Типовой маршрут для write operation:

```text
Стартовый блок
  -> Присвоить
  -> Синхронное обращение к сервису
  -> Если
  -> Завершение БП
```

Настройте блоки:

| Блок БП Avanpost IDM              | Как использовать с idmMw                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Стартовый блок`                  | Начало процесса. Получает контекст заявки, роли, пользователя или события.                                                  |
| `Присвоить`                       | Подготовьте переменные `eventId`, `targetSystem`, `operation` и JSON body.                                                  |
| `Синхронное обращение к сервису`  | Выберите `Функция обращения к сервису` из `Настройка процессов -> Скрипты`. Результат сохраните в выходной параметр `Data`. |
| `Асинхронное обращение к сервису` | Используйте только если в IDM нужен отложенный ответ. Настройте `Result`, `Интервал проверки выполнения задачи` и handler.  |
| `Если` или `Выбор`                | Разберите HTTP/status/result и направьте процесс в success/error branch.                                                    |
| `Завершение БП`                   | Завершите процесс с понятным статусом для заявки или мониторинга.                                                           |

Для `Синхронное обращение к сервису` заполните:

| Параметр блока                 | Значение для idmMw                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Входной `NameSection (String)` | Служебный идентификатор блока, оставьте по правилам IDM.                                                    |
| Выходной `Data (String)`       | Переменная, куда сохраняется результат вызова idmMw.                                                        |
| `Функция обращения к сервису`  | Скрипт строковой операции из `Настройка процессов -> Скрипты`, который выполняет `POST /webhooks/avanpost`. |

Для `Асинхронное обращение к сервису` заполните:

| Параметр блока                        | Значение для idmMw                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Выходной `Result (String)`            | Переменная для результата обработки ответа сервиса.                                        |
| `Имя точки маршрута`                  | Точка маршрута выбранного этапа БП.                                                        |
| `Ограничение длительности этапа`      | SLA ожидания, после которого процесс выйдет по событию `Таймаут`.                          |
| `Интервал проверки выполнения задачи` | Интервал проверки функции обработки ответа.                                                |
| `Функция обращения к сервису`         | Скрипт, который отправляет webhook в idmMw.                                                |
| `Функция обработки ответа сервиса`    | Скрипт логической операции, который проверяет ответ idmMw и решает, завершать ли ожидание. |

Если одно бизнес-событие должно уйти в несколько целевых систем, добавьте
несколько сервисных блоков или несколько веток процесса. Endpoint остаётся тем
же, но `targetSystem` и `eventId` должны отличаться:

```text
request-123:zabbix-prod  -> targetSystem=zabbix-prod
request-123:portal-hr    -> targetSystem=portal-hr
```

### 5. Обработка событий

Раздел:

```text
Обработка событий
```

используется, если idmMw должен вызываться реакцией на системное событие IDM.
На вкладке `Список` создайте обработчик событий и заполните карточку:

| Поле обработчика Avanpost IDM      | Как заполнять для idmMw                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `Название обработчика`             | Человекочитаемое имя, например `Send account changes to idmMw`.                                                    |
| `Описание обработчика`             | Что отправляется в idmMw и для каких ресурсов.                                                                     |
| `Название события`                 | Выберите событие IDM, например создание, изменение, блокировка, включение, отключение или удаление учётной записи. |
| `Тип обработки события`            | `Создание документа` для заявки или `Создание процесса без документа` для фоновой реакции без заявки.              |
| `Скрипт обработки`                 | Скрипт, который решает, запускать ли обработку, и формирует контекст процесса или документа.                       |
| `Схема бизнес-процесса`            | Схема БП, где сервисный блок вызывает idmMw webhook.                                                               |
| `Приоритет`                        | Число приоритета. Используйте явный порядок, если несколько обработчиков реагируют на одно событие.                |
| `Не сохранять пропущенные события` | Включайте только если пропущенные события не нужны в журнале диагностики.                                          |
| `Эксклюзивная обработка`           | Включайте, если успешная обработка этим handler должна остановить следующие handler того же события.               |

После создания включите обработчик в карточке или переключателем на вкладке
`Список`. Для диагностики используйте вкладку `Журнал`: там проверяются статус,
объект события, ссылка на заявку/процесс и логи выполнения обработчика. При
ошибке в IDM можно перезапустить обработку события из журнала; при ошибке в
целевой системе idmMw может положить write-событие в DLQ.

### Mapping полей IDM в webhook body

Настройте JSON body в IDM так, чтобы каждое событие формировало следующие поля:

| Поле webhook       | Источник в IDM                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `eventId`          | Уникальный ID заявки/процесса/операции + `targetSystem`, например `request-123:zabbix-prod`   |
| `operation`        | Код операции IDM, например `user.create`, `user.update`, `group.addMember`, `system.test`     |
| `targetSystem`     | Строка, равная `TargetSystem.name` в idmMw                                                    |
| `payload.data`     | Изменяемые атрибуты пользователя/группы: username, email, groups, password, attributes и т.п. |
| `payload.params`   | Идентификаторы и фильтры для read/test операций: `id`, `filter`, `limit`, `groupId`, `userId` |
| `payload.metadata` | Опциональный контекст: requestId, initiator, approvalId, sourceProcess                        |

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
2. В Avanpost IDM создать ресурс в `Интеграции -> Целевые системы`, проверить
   `Атрибуты ресурса`, профили, права и периоды недоступности.
3. Проверить, что система включена в idmMw и видна в `GET /idm/target-systems`.
4. Проверить связь через `GET /idm/<targetSystem>/test`.
5. В `Настройка процессов -> Скрипты` подготовить функцию обращения к сервису,
   которая отправляет `POST /webhooks/avanpost`.
6. В `Настройка процессов -> Бизнес-процессы` добавить блок
   `Синхронное обращение к сервису` или `Асинхронное обращение к сервису`.
7. Если используется event-driven запуск, создать и включить handler в
   `Обработка событий`, затем проверить вкладку `Журнал`.
8. Отправить тестовое write-событие из IDM или через Mock IDM.
9. Проверить HTTP response, structured logs, `/metrics`, вкладку `Очередь` в
   ресурсе IDM и DLQ в idmMw Admin UI.
10. Для production включить HTTPS/mTLS или gateway controls по политике
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
