---
"@effect-app/infra": patch
---

Unify Emailer `sendMail` spans across implementations. `Fake.sendMail` and `Sendgrid.sendMail` now both emit as `Emailer.sendMail` with OTel-standard `messaging.system` attribute (`"fake"` / `"sendgrid"`).
