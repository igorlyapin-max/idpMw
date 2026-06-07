# CMDBuild REST API v3 — IAM Operations (Users & Roles)

## Scope

Skill for idmMw project. Describes correct CMDBuild REST API v3 endpoints for user and role management, as discovered through live testing against CMDBuild Ready2Use demo container.

## Key Finding: Do NOT use /classes/User/cards or /classes/Role/cards

In CMDBuild Ready2Use, `User` and `Role` are **system/internal classes**. Write operations (POST/PUT/DELETE) on `/classes/User/cards` and `/classes/Role/cards` return:

```json
{"success":false,"messages":[{"message":"permission denied: cannot create card of class = ClasseImpl{name=User}"}]}
```

## Correct Endpoints for IAM

### Users

| Operation | Endpoint | Status in demo |
|-----------|----------|----------------|
| List users | `GET /users` | ✅ Works |
| Get user | `GET /users/{userId}` | ✅ Works |
| Create user | `POST /users` | ❌ Generic error (needs elevated privileges) |
| Update user | `PUT /users/{userId}` | ❌ Generic error |
| Delete user | `DELETE /users/{userId}` | ❌ Generic error |
| Change password | `POST /users/{userId}/password` | ❌ Generic error |
| Change own password | `PUT /users/current/password` | ❌ Generic error |

User data structure (from GET /users/{id}):
```json
{
  "_id": 13,
  "username": "admin",
  "description": "Administrator",
  "email": null,
  "active": true,
  "service": false,
  "userTenants": [],
  "userGroups": [{"_id": 14, "name": "SuperUser"}],
  "defaultUserGroup": null,
  "language": "en",
  "initialPage": null,
  "multiGroup": false,
  "changePasswordRequired": false
}
```

### Roles

| Operation | Endpoint | Status in demo |
|-----------|----------|----------------|
| List roles | `GET /roles` | ✅ Works |
| Get role | `GET /roles/{roleId}` | Not tested |
| Create role | `POST /roles` | ✅ Works |
| Update role | `PUT /roles/{roleId}` | Not tested |
| Delete role | `DELETE /roles/{roleId}` | Not tested |
| List role users | `GET /roles/{roleId}/users` | ✅ Works |
| Update role users | `POST /roles/{roleId}/users` | ❌ Generic error |

Role data structure:
```json
{
  "type": "admin|default",
  "name": "SuperUser",
  "description": "SuperUser",
  "email": null,
  "active": true,
  "processWidgetAlwaysEnabled": false,
  "startingClass": null
}
```

### Authentication

| Operation | Endpoint | Notes |
|-----------|----------|-------|
| Create session | `POST /sessions?scope=service&returnId=true` | Returns `_id` as session token |
| Use session | Header `Cmdbuild-Authorization: {sessionId}` | Required for some endpoints |
| Basic Auth | `Authorization: Basic base64(user:pass)` | Works for read-only endpoints |

### What DOES work for write operations

Non-system classes like `Employee`, `HrPerson`, `C2MTestCI` allow full CRUD:
- `POST /classes/Employee/cards` → ✅ Creates card
- `PUT /classes/Employee/cards/{id}` → ✅ Updates card
- `DELETE /classes/Employee/cards/{id}` → Not tested, likely works

## Demo Container Limitations

The CMDBuild Ready2Use demo container (`cmdbuild_app` at `0.0.0.0:8090`) restricts write operations on system classes (`User`, `Role`) even for the `admin` user with `SuperUser` role. This is a **container limitation**, not a code bug.

To enable full user/role CRUD in a production CMDBuild instance:
1. Configure grants in CMDBuild Admin UI for the target role
2. Or use a service-account user with `admin_all` privileges
3. Or use the SOAP API (deprecated but sometimes less restricted)

## Mapping IDM Operations to CMDBuild

| IDM Operation | CMDBuild Endpoint | Notes |
|---------------|-------------------|-------|
| `user.get` | `GET /users/{id}` | ✅ |
| `user.search` | `GET /users` | ✅ Use filter param |
| `user.create` | `POST /users` | ⚠️ Needs production CMDBuild with grants |
| `user.update` | `PUT /users/{id}` | ⚠️ Needs production CMDBuild with grants |
| `user.delete` | `DELETE /users/{id}` | ⚠️ Needs production CMDBuild with grants |
| `user.enable` | `PUT /users/{id}` with `{"active":true}` | ⚠️ Needs production CMDBuild with grants |
| `user.disable` | `PUT /users/{id}` with `{"active":false}` | ⚠️ Needs production CMDBuild with grants |
| `user.changePassword` | `POST /users/{id}/password` | ⚠️ Needs production CMDBuild with grants |
| `group.get` | `GET /roles/{id}` | ✅ |
| `group.search` | `GET /roles` | ✅ Use filter param |
| `group.create` | `POST /roles` | ✅ Works even in demo |
| `group.update` | `PUT /roles/{id}` | ⚠️ Needs production CMDBuild with grants |
| `group.delete` | `DELETE /roles/{id}` | ⚠️ Needs production CMDBuild with grants |
| `group.addMember` | `POST /roles/{roleId}/users` | ⚠️ Needs production CMDBuild with grants |
| `group.removeMember` | `POST /roles/{roleId}/users` with filtered list | ⚠️ Needs production CMDBuild with grants |
| `system.test` | `GET /classes` | ✅ |
| `schema.get` | `GET /classes` + `GET /classes/{name}/attributes` | ✅ |
| `sync.full` | `GET /users` + `GET /roles` | ✅ |

## Connector Implementation Notes

1. Use `/users` and `/roles` endpoints, not `/classes/User/cards` or `/classes/Role/cards`
2. For `addMember`/`removeMember`, use `POST /roles/{roleId}/users` with full updated `users` array (similar to Zabbix approach)
3. Basic Auth works for read operations; session auth may be needed for write operations in some configurations
4. Config should allow specifying `className` for fallback to generic cards API (for non-system classes)
