# Architecture decision records

| ADR                                              | Status   | Decision                                                                        |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------- |
| [0001](0001-idmmw-as-multi-target-middleware.md) | Accepted | idmMw is one middleware endpoint for many target systems                        |
| [0002](0002-db-backed-target-systems.md)         | Accepted | `TargetSystem` DB rows create runtime dynamic connector proxies                 |
| [0003](0003-runtime-diagnostics-and-logging.md)  | Accepted | Diagnostic mode and multi-sink logging are runtime contracts                    |
| [0004](0004-prod-ha-db-profiles.md)              | Accepted | YugabyteDB is the default prod HA profile; CockroachDB is supported alternative |

ADR files are concise by design. Operational steps remain in the main docs.
