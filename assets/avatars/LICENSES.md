# Лицензии 3D-моделей (фаза 4)

Файлы лежат в `public/models/`. Текстуры уменьшены скриптом `scripts/shrink-vrm.py` (до 1024 px);
геометрия, выражения, кости и метаданные VRM не менялись.

| Файл | Модель | Автор | Источник | Условия |
|---|---|---|---|---|
| `avatar-sample-a.vrm` | AvatarSample_A (VRoidPreset_A) | VRoid Project (pixiv Inc.) | [VRoid Hub](https://hub.vroid.com/en/characters/2843975675147313744/models/5644550979324015604) | см. ниже |
| `avatar-sample-b.vrm` | AvatarSample_B (VRoidPreset_B) | VRoid Project (pixiv Inc.) | [VRoid Hub](https://hub.vroid.com/en/characters/7939147878897061040/models/2292219474373673889) | см. ниже |
| `avatar-sample-c.vrm` | AvatarSample_C (VRoidPreset_C) | VRoid Project (pixiv Inc.) | [VRoid Hub](https://hub.vroid.com/en/characters/1248981995540129234/models/8640547963669442173) | см. ниже |
| `avatar-sample-z.vrm` | AvatarSample_Z (VRoidPreset_Z) | pixiv VRoid Project | экспорт из VRoid Studio 2.17.0 (Sample Models), VRM 1.0 | см. ниже |

## Условия (проверено 2026-11-27)

Не CC0. Условия pixiv для VRoidPreset_A–Z: <https://vroid.pixiv.help/hc/en-us/articles/4402394424089>.

- Можно: использовать .vroid и VRM кем угодно, в коммерческих и некоммерческих целях; импортировать и
  использовать как аватар в приложениях с поддержкой VRM; менять текстуры и параметры. Указывать автора не нужно.
- Нельзя: перераспространять модель с пометкой CC0; **делать сервис создания персонажей на данных модели**;
  перераспространять .vroid/VRM за плату; выдавать продукт за поддержанный pixiv.

Метаданные внутри файлов (VRM 0.x `meta`): `allowedUserName: Everyone`, `commercialUssageName: Allow`,
лицензия VRoid Hub: corporate_commercial_use=allow, modification=allow, redistribution=allow, credit=unnecessary.

**Как мы их используем:** модели показываются как есть, как выбор базового аватара. Перекраски их материалов и
выдачи изменённых моделей нет — чтобы не попасть под запрет «сервиса создания персонажей». Свои модели пользователь
делает в VRoid Studio и загружает сам (фаза 4b).

## Экспорт из VRoid Studio

Заготовки D–Z есть только внутри VRoid Studio (Sample Models). VRoid Studio при экспорте по умолчанию пишет в
метаданные VRM 1.0 строгие поля (`avatarPermission: onlyAuthor`, `allowRedistribution: false`,
`modification: prohibited`, `creditNotation: required`) — это настройки диалога экспорта, а не условия заготовки.
`scripts/shrink-vrm.py --pixiv-preset` заменяет их на фактические условия pixiv для VRoidPreset A–Z
(можно всем, коммерчески, без указания автора) и ставит `otherLicenseUrl` на страницу этих условий.

## Не используем

- β Ver AvatarSample_1–4 — CC0 (pixiv), но стиль старой беты; владелица выбрала более анимешные A–C.
- 100Avatars (Polygonal Mind, CC0 по реестру open-source-avatars) — низкополигональный стиль, не аниме.
